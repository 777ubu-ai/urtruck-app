-- ============================================================
-- Deal Room foundation (First PR — backend foundation).
-- Расширение существующего чата (chat_rooms / chat_messages), НЕ rewrite.
-- Все CREATE TABLE IF NOT EXISTS — идемпотентно, безопасно при повторе.
-- conversation_id хранит chat_rooms.id (room_id) для совместимости.
-- ============================================================

-- N-участниковая модель поверх chat_rooms (participant_1/2 → строки здесь).
CREATE TABLE IF NOT EXISTS conversation_participants (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,            -- = chat_rooms.id (room_id)
    user_id         TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',  -- driver | client | support | member
    joined_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    UNIQUE (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_part_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_part_user ON conversation_participants(user_id);

-- Вложения как сущность (сейчас без upload-эндпоинта — модель готова).
CREATE TABLE IF NOT EXISTS message_attachments (
    id              TEXT PRIMARY KEY,
    message_id      TEXT,                     -- chat_messages.id (может быть отложенным)
    conversation_id TEXT NOT NULL,
    uploader_id     TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'other',   -- photo | document | voice | other
    url             TEXT,
    mime_type       TEXT,
    size_bytes      INTEGER,
    upload_status   TEXT NOT NULL DEFAULT 'queued',  -- queued|uploading|uploaded|failed|retrying
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_msg_att_conv ON message_attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_att_msg ON message_attachments(message_id);

-- Точные read-receipts (расширение, НЕ замена chat_messages.is_read).
CREATE TABLE IF NOT EXISTS message_read_receipts (
    id          TEXT PRIMARY KEY,
    message_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    read_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_read_rcpt_user ON message_read_receipts(user_id);

-- Юридически значимый IMMUTABLE timeline сделки.
-- Хранится event_type + i18n_key + payload (НЕ готовый русский текст).
-- Нет endpoint update/delete для обычного пользователя.
CREATE TABLE IF NOT EXISTS deal_events (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT,                     -- chat_rooms.id (room_id) если есть
    event_type      TEXT NOT NULL,            -- deal.bid_created, deal.bid_accepted, ...
    i18n_key        TEXT NOT NULL,            -- ключ для перевода на фронте (RU/KZ/UZ/ZH)
    payload_json    TEXT,                     -- JSON-параметры события
    actor_id        TEXT,                     -- кто инициировал (с backend, не с фронта)
    actor_role      TEXT,                     -- driver | client | support | system
    load_id         TEXT,                     -- cargo_id
    trip_id         TEXT,
    bid_id          TEXT,
    deal_id         TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- server timestamp
    is_system       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_deal_events_deal ON deal_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_events_conv ON deal_events(conversation_id);

-- Эскалация в поддержку (future-ready; support как 3-й участник).
CREATE TABLE IF NOT EXISTS support_escalations (
    id                       TEXT PRIMARY KEY,
    conversation_id          TEXT,            -- chat_rooms.id (room_id)
    requested_by_user_id     TEXT NOT NULL,
    assigned_support_user_id TEXT,
    status                   TEXT NOT NULL DEFAULT 'open',  -- open | assigned | closed
    reason                   TEXT,
    created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at                TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_esc_status ON support_escalations(status);
CREATE INDEX IF NOT EXISTS idx_support_esc_user ON support_escalations(requested_by_user_id);
