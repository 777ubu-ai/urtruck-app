-- ============================================================
-- CGR Integration Schema (Stream A) — ТЗ-CGR-001 v1.1
-- Style: matches existing schemas (marketplace, security, etc.)
-- All tables prefixed with 'cgr_' or 'border_' for clarity.
-- Applied via init_cgr_schema() in backend/database/cgr_dal.py
-- ============================================================

-- ----------------------------------------------------------------
-- Погранпереходы (заменяет хардкод BORDERS = [...] в border_service.py).
-- Источник seed: тот же хардкод, переносится один раз через
-- _seed_border_checkpoints_from_legacy(). После QA-приёмки раздела 2.2
-- чеклиста хардкод можно будет удалить, и таблица станет источником истины.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS border_checkpoints (
    code TEXT PRIMARY KEY,                  -- внутренний slug: khorgos, dostyk, ...
    name_ru TEXT NOT NULL,
    name_kz TEXT,
    name_cn TEXT,
    name_en TEXT,
    country_from TEXT NOT NULL DEFAULT 'KZ',
    country_to TEXT NOT NULL,               -- 'CN' | 'RU' | 'UZ' | 'KG'
    lat REAL,
    lon REAL,
    type TEXT,                              -- 'auto+cargo' | 'rail+cargo' | 'auto'
    cgr_external_id TEXT,                   -- ID как его знает CGR (после разведки 1.1)
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_border_checkpoints_active
    ON border_checkpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_border_checkpoints_country_to
    ON border_checkpoints(country_to);

-- ----------------------------------------------------------------
-- Кэш онлайн-табло загруженности.
-- History-style: каждый fetch добавляет новые строки. Для отдачи
-- фронту берётся последняя запись по каждому (checkpoint_code, direction).
-- Старые записи (>30 дней) подчищаются отдельным cron-job'ом.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgr_scoreboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkpoint_code TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    queue_length INTEGER,                   -- сколько ТС в очереди
    estimated_wait_minutes INTEGER,
    raw_payload TEXT,                       -- сырой JSON/HTML-фрагмент для дебага
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkpoint_code) REFERENCES border_checkpoints(code)
);

CREATE INDEX IF NOT EXISTS idx_cgr_scoreboard_lookup
    ON cgr_scoreboard(checkpoint_code, direction, fetched_at DESC);

-- ----------------------------------------------------------------
-- Брони водителей UrTruck — привязка к рейсам и кэш статусов с CGR.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgr_booking_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    urtruck_user_id TEXT NOT NULL,
    urtruck_trip_id TEXT,
    cgr_booking_number TEXT NOT NULL,
    checkpoint_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'active', 'completed', 'cancelled', 'not_found')),
    queue_position INTEGER,
    scheduled_at TEXT,
    last_known_payload TEXT,
    last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (urtruck_user_id, cgr_booking_number),
    FOREIGN KEY (checkpoint_code) REFERENCES border_checkpoints(code)
);

CREATE INDEX IF NOT EXISTS idx_cgr_booking_user ON cgr_booking_status(urtruck_user_id);
CREATE INDEX IF NOT EXISTS idx_cgr_booking_trip ON cgr_booking_status(urtruck_trip_id);
CREATE INDEX IF NOT EXISTS idx_cgr_booking_active
    ON cgr_booking_status(status) WHERE status IN ('pending', 'verified', 'active');

-- Журнал опросов брони (для дебага и админ-панели — раздел 5.4 чеклиста)
CREATE TABLE IF NOT EXISTS cgr_booking_poll_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    polled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    old_status TEXT,
    new_status TEXT,
    old_position INTEGER,
    new_position INTEGER,
    changed INTEGER NOT NULL DEFAULT 0,     -- 1 = было изменение, 0 = no-op
    push_sent INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (booking_id) REFERENCES cgr_booking_status(id)
);

CREATE INDEX IF NOT EXISTS idx_cgr_booking_poll_log_booking
    ON cgr_booking_poll_log(booking_id, polled_at DESC);

-- ----------------------------------------------------------------
-- Кэш чёрного списка CGR — ТОЛЬКО для внутреннего матчинга.
-- НИКАКИЕ публичные API UrTruck НЕ должны отдавать данные из этой таблицы
-- (раздел 6.5 чеклиста). Доступ — только модули из backend/cgr/.
-- ИИН не хранится в открытом виде — только SHA256-хэш с солью CGR_IIN_SALT.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgr_blocklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Заполняем только те поля, которые CGR реально публикует (см. CGR_DISCOVERY.md 1.4)
    iin_hash TEXT,                          -- SHA256(ИИН + CGR_IIN_SALT), 64 hex символа
    grnz_normalized TEXT,                   -- нормализованный гос. номер
    full_name_normalized TEXT,              -- LOWER(TRIM(ФИО)) для fuzzy
    blocked_at TEXT,
    reason TEXT,
    raw_payload TEXT,                       -- сырой фрагмент для аудита (без ИИН!)
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cgr_blocklist_iin
    ON cgr_blocklist(iin_hash) WHERE iin_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cgr_blocklist_grnz
    ON cgr_blocklist(grnz_normalized) WHERE grnz_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cgr_blocklist_fetched
    ON cgr_blocklist(fetched_at DESC);

-- ----------------------------------------------------------------
-- Журнал срабатываний скоринга по CGR-блокировке.
-- Решение о блокировке — за модератором (НЕ автомат).
-- Хранится минимум 1 год (раздел 3.4 ТЗ + раздел 7.3 чеклиста).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgr_blocklist_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    urtruck_user_id TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('iin', 'grnz', 'name')),
    match_confidence TEXT NOT NULL CHECK (match_confidence IN ('exact', 'fuzzy')),
    cgr_blocklist_id INTEGER,
    moderation_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (moderation_status IN ('pending_review', 'confirmed_block', 'false_positive', 'appealed')),
    reviewed_by_user_id TEXT,
    reviewed_at TEXT,
    review_notes TEXT,
    detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cgr_blocklist_id) REFERENCES cgr_blocklist(id)
);

CREATE INDEX IF NOT EXISTS idx_cgr_matches_user
    ON cgr_blocklist_matches(urtruck_user_id);
CREATE INDEX IF NOT EXISTS idx_cgr_matches_pending
    ON cgr_blocklist_matches(moderation_status) WHERE moderation_status = 'pending_review';

-- ----------------------------------------------------------------
-- Throttle log для push-уведомлений (раздел 5.3 чеклиста).
-- Не более 1 push в час на одну бронь — проверяем через MAX(sent_at).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cgr_push_throttle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    push_kind TEXT NOT NULL,                -- 'queue_changed' | 'wait_time' | 'activated' | 'cancelled'
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES cgr_booking_status(id)
);

CREATE INDEX IF NOT EXISTS idx_cgr_push_throttle_booking
    ON cgr_push_throttle(booking_id, sent_at DESC);
