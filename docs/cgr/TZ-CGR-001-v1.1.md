# ТЗ-CGR-001 v1.1: Интеграция UrTruck с CarGoRuqsat — Поток А

**Изменения в v1.1 по сравнению с v1.0:**
- ❗ Схема БД переписана с PostgreSQL/Supabase на **SQLite** (`/home/ubuntu/urtruck/backend/database/security.db`) — по результатам аудита Claude Code CLI
- ❗ Управление схемой через `.sql + init_cgr_schema()`, **без Alembic**
- ❗ Папка модуля: `backend/cgr/` (по аналогии с `backend/blacklist/`, `backend/ocr/`)
- ❗ API-эндпоинт scoreboard расширяет существующий `/api/v1/borders/...`, не дублирует
- ❗ Frontend: расширяем существующий `src/screens/CargoRuqsatInfoScreen.js`
- ❗ Список погранпереходов берём из CGR scoreboard, не хардкодим
- ❗ Privacy: ИИН-хэш в SQLite вместо Supabase RLS

---

**Проект:** UrTruck Marketplace (urtruck.kz)
**Ответственный разработчик:** Сергей (Backend) + Настя (Frontend)
**QA:** Перизат, Данияр
**Security:** Марат
**Тех. лид:** Бахитжан + Claude (architecture review)
**Версия ТЗ:** 1.1
**Дата:** 28 мая 2026
**Статус:** Утверждено к разработке
**Срок MVP:** 14 календарных дней
**Предусловие:** мерж веток `claude/epic-goodall-7dR7Z` → `main` выполнен, локальная копия синхронизирована, создана ветка `feature/cgr-stream-a`

---

## 0. КОНТЕКСТ

UrTruck готовится к публичной бете. Один из ключевых юзкейсов — международные перевозки KZ↔CN/RU/UZ/KG, где водитель **по закону** обязан бронировать электронную очередь на пограничном пункте пропуска через систему **CarGoRuqsat** (cgr.qoldau.kz), оператор — АО «Информационно-учётный центр».

**Прямой API через государственный шлюз Smart Bridge (сервис `CargoRuqsatAppsServiceSync`, паспорт ORGAM-S-9317) станет доступен через 4-6 месяцев** после прохождения испытаний на соответствие требованиям ИБ (ПП РК №832).

**До этого момента** мы строим «Поток А» — информационный слой на базе **публично доступных** реестров CarGoRuqsat. Это легально, не требует разрешений и даёт водителю UrTruck реальную ценность.

**Существующая инфраструктура UrTruck (готово на 60%):**
- ✅ `backend/services/border_service.py` + `backend/api/borders.py` — базовый borders-модуль с 8 захардкоженными переходами и mock-очередью
- ✅ `src/screens/CargoRuqsatInfoScreen.js` — info-экран в 4 секциях с CTA-кнопкой на cgr.qoldau.kz
- ✅ Меню «🚧 Электронная очередь / CarGoRuqsat · скоро» в Profile
- ✅ i18n: 1070 ключей × 4 локали (RU, KZ, EN, CN)
- ✅ Push-инфраструктура работает (VAPID + Expo)

**ЗАПРЕЩЕНО (юридически):**
- ❌ WebView / iframe / inAppBrowser со страницей `cgr.qoldau.kz`
- ❌ Проксирование форм авторизации CGR через наш backend
- ❌ Хранение или обработка ЭЦП водителя
- ❌ Эмуляция действий пользователя (Selenium/Puppeteer для бронирования)
- ❌ Парсинг с попыткой логина (только публичные неавторизованные страницы)
- ❌ Показ ПДн третьих лиц (ИИН, ФИО заблокированных) в публичном интерфейсе

При соблазне «сделать удобнее» в этих пунктах — **остановиться и эскалировать тех. лиду**. Любое нарушение блокирует Поток Б.

---

## 1. РАЗВЕДКА (Discovery) — этап 0

**Срок:** 1 рабочий день
**Deliverable:** `docs/cgr/CGR_DISCOVERY.md` в репозитории + отчёт в Slack тех. лиду

Сергей лично проверяет:

### 1.1. Онлайн-табло
```
URL: https://cgr.qoldau.kz/ru/registry/scoreboard
```
- DevTools → Network: рендерится SSR или AJAX-запрос?
- Если AJAX → точный endpoint, метод, headers, формат ответа
- Если SSR → CSS-селекторы таблицы
- **Зафиксировать имена всех ПП как пишет CGR** — это станет seed для таблицы `border_checkpoints`

### 1.2. Реестр бронирований
```
URL: https://cgr.qoldau.kz/ru/registry/public-list
```
- Какие поля публичны? (номер брони, ГРНЗ, дата, статус, ПП)
- **Есть ли ИИН или ФИО?** Если есть — фиксируем как PII
- Поиск по номеру брони через GET-параметр?

### 1.3. Реестр АТС в зоне ожидания
```
URL: https://cgr.qoldau.kz/ru/registry/wa-history/list?flStatus=Active
```
- Поля, формат, доступность по ГРНЗ

### 1.4. Заблокированные пользователи (КРИТИЧНО!)
```
URL: https://cgr.qoldau.kz/ru/information/blocked-users
```
- **Какие именно поля публикуются?** ИИН? ФИО? ГРНЗ? БИН? Дата? Причина?
- От ответа зависит весь алгоритм матчинга
- Формат: HTML или JSON?

### 1.5. robots.txt и Terms of Service
```
URL: https://cgr.qoldau.kz/robots.txt
URL: cgr.qoldau.kz/ru/start → Пользовательское соглашение
```
- Запрещён ли парсинг публичных реестров?
- Если запрет — **остановиться и эскалировать**

### 1.6. Rate limit
- Тестировать: 1 запрос/сек → 5 → 10
- Зафиксировать порог 429
- Установить рабочий порог в 2 раза ниже найденного

**Итог этапа:** в `CGR_DISCOVERY.md` конкретные ответы на все 6 пунктов. Без этого этап 2 не начинать.

---

## 2. АРХИТЕКТУРА МОДУЛЯ

### 2.1. Структура файлов

Интегрируем в существующий FastAPI backend. **Не создавать отдельный микросервис.**

```
backend/
├── cgr/                              # НОВЫЙ модуль
│   ├── __init__.py
│   ├── client.py                     # httpx-клиент к cgr.qoldau.kz
│   ├── parsers.py                    # парсеры HTML (bs4+lxml) и JSON
│   ├── scoreboard_service.py         # сервис онлайн-табло
│   ├── booking_service.py            # сервис статусов броней
│   ├── blocklist_service.py          # сервис чёрного списка
│   ├── schemas.py                    # Pydantic-модели
│   ├── exceptions.py                 # CGRException, CGRRateLimitError
│   └── settings.py                   # CGRSettings (pydantic-settings)
├── services/
│   └── border_service.py             # СУЩЕСТВУЮЩИЙ — расширяем
├── api/
│   └── borders.py                    # СУЩЕСТВУЮЩИЙ — расширяем
├── database/
│   └── schemas/
│       └── cgr_schema.sql            # НОВАЯ схема SQLite
├── scheduler/
│   └── cgr_jobs.py                   # НОВЫЕ APScheduler-задачи
└── tests/
    └── cgr/
        ├── test_client.py
        ├── test_parsers.py
        ├── test_blocklist_matching.py
        └── fixtures/                 # сохранённые ответы CGR
```

### 2.2. Схема БД (SQLite) — `backend/database/schemas/cgr_schema.sql`

```sql
-- ============================================================
-- CGR Integration Schema (Stream A)
-- Style: matches existing schemas (marketplace, security, etc.)
-- All tables prefixed with 'cgr_' or 'border_' for clarity.
-- ============================================================

-- Таблица погранпереходов (заменяет хардкод BORDERS = [...])
CREATE TABLE IF NOT EXISTS border_checkpoints (
    code TEXT PRIMARY KEY,                  -- наш внутренний slug (khorgos, dostyk, ...)
    name_ru TEXT NOT NULL,
    name_kz TEXT,
    name_cn TEXT,
    name_en TEXT,
    country_from TEXT NOT NULL,             -- 'KZ'
    country_to TEXT NOT NULL,               -- 'CN' / 'RU' / 'UZ' / 'KG'
    lat REAL,
    lon REAL,
    cgr_external_id TEXT,                   -- ID как его знает CGR (если применимо)
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_border_checkpoints_active
    ON border_checkpoints(is_active);

-- Кэш онлайн-табло загруженности (history-style для трендов)
CREATE TABLE IF NOT EXISTS cgr_scoreboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkpoint_code TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    queue_length INTEGER,
    estimated_wait_minutes INTEGER,
    raw_payload TEXT,                       -- сырой JSON-ответ для дебага
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkpoint_code) REFERENCES border_checkpoints(code)
);

CREATE INDEX IF NOT EXISTS idx_cgr_scoreboard_lookup
    ON cgr_scoreboard(checkpoint_code, fetched_at DESC);

-- Брони водителей UrTruck (привязка к рейсам)
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

-- Кэш чёрного списка CGR (только для внутреннего использования)
CREATE TABLE IF NOT EXISTS cgr_blocklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Заполняем только те поля, которые CGR реально публикует (см. этап 1.4)
    iin_hash TEXT,                          -- SHA256(ИИН + salt) если ИИН публикуется
    grnz_normalized TEXT,                   -- нормализованный гос. номер
    full_name_normalized TEXT,              -- LOWER(TRIM(ФИО)) для fuzzy-матчинга
    blocked_at TEXT,
    reason TEXT,
    raw_payload TEXT,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cgr_blocklist_iin ON cgr_blocklist(iin_hash);
CREATE INDEX IF NOT EXISTS idx_cgr_blocklist_grnz ON cgr_blocklist(grnz_normalized);

-- Журнал срабатываний скоринга по CGR-блокировке
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
```

### 2.3. Инициализация схемы

Добавить в `backend/main.py` рядом с существующими `init_*_schema()`:

```python
from backend.database.init_schemas import init_cgr_schema

@app.on_event("startup")
async def startup():
    # ... существующие init_*_schema() вызовы ...
    init_cgr_schema()
```

В `backend/database/init_schemas.py` добавить функцию:

```python
def init_cgr_schema():
    """Инициализация схемы CarGoRuqsat-интеграции."""
    schema_path = Path(__file__).parent / 'schemas' / 'cgr_schema.sql'
    with sqlite3.connect(DB_PATH) as conn:
        with open(schema_path, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
    # Seed погранпереходов из захардкоженного BORDERS (один раз)
    _seed_border_checkpoints_from_legacy_borders()
```

### 2.4. Миграция захардкоженных переходов

После создания таблицы `border_checkpoints` — однократный seed из `BORDERS = [...]` в `border_service.py`:

```python
def _seed_border_checkpoints_from_legacy_borders():
    """Однократно переносит хардкод в таблицу. Безопасно вызывать повторно."""
    from backend.services.border_service import BORDERS  # текущий хардкод
    with sqlite3.connect(DB_PATH) as conn:
        for b in BORDERS:
            conn.execute("""
                INSERT OR IGNORE INTO border_checkpoints
                    (code, name_ru, country_from, country_to, ...)
                VALUES (?, ?, ?, ?, ...)
            """, (b['code'], b['name_ru'], 'KZ', b['country_to'], ...))
```

**После seed** — `BORDERS = [...]` в `border_service.py` **удалить**. Все чтения погранпереходов идут из БД.

### 2.5. HTTP-клиент (`cgr/client.py`)

```python
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from backend.cgr.settings import cgr_settings


class CGRClient:
    """Клиент к публичным реестрам cgr.qoldau.kz."""

    BASE_URL = cgr_settings.base_url
    USER_AGENT = cgr_settings.user_agent

    def __init__(self):
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0),
            headers={"User-Agent": self.USER_AGENT},
            follow_redirects=True,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=60),
    )
    async def fetch_scoreboard(self) -> dict: ...

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=4, max=60))
    async def fetch_booking_status(self, booking_number: str) -> dict: ...

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=4, max=60))
    async def fetch_blocklist_page(self, page: int = 1) -> dict: ...

    # При 429:
    #   - logger.warning("CGR rate limit hit, sleeping 60s")
    #   - asyncio.sleep(60)
    #   - raise CGRRateLimitError
    # При 5xx подряд 5+ раз — Sentry capture + Slack alert
```

### 2.6. Настройки (`cgr/settings.py`)

```python
from pydantic_settings import BaseSettings


class CGRSettings(BaseSettings):
    base_url: str = "https://cgr.qoldau.kz"
    user_agent: str = "UrTruck/1.0 (+https://urtruck.kz; partner-integration)"
    request_timeout_sec: int = 30
    scoreboard_interval_min: int = 5
    booking_poll_interval_min: int = 15
    blocklist_cron: str = "0 3 * * *"
    iin_salt: str  # обязательно из env
    rate_limit_requests_per_min: int = 20
    feature_enabled: bool = True

    class Config:
        env_prefix = "CGR_"
        env_file = ".env"


cgr_settings = CGRSettings()
```

---

## 3. ФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ

### 3.1. Сервис онлайн-табло (FR-1)

**Cron:** каждые **5 минут** через APScheduler в `backend/scheduler/cgr_jobs.py`.

**Расширяем существующий эндпоинт** `GET /api/v1/borders/scoreboard` в `backend/api/borders.py`:
- Раньше возвращал mock-данные из `border_service.py`
- Теперь: читает кэш из таблицы `cgr_scoreboard` (последние записи по каждому ПП)
- Если данных нет / устарели >60 мин → отдаёт фолбэк mock + флаг `status: "stale"`

**Response 200:**
```json
{
  "fetched_at": "2026-05-28T10:23:00Z",
  "checkpoints": [
    {
      "code": "khorgos",
      "name_ru": "Хоргос",
      "name_kz": "Қорғас",
      "name_cn": "霍尔果斯",
      "directions": {
        "in":  { "queue_length": 42, "estimated_wait_minutes": 360 },
        "out": { "queue_length": 18, "estimated_wait_minutes": 180 }
      },
      "status": "ok",
      "last_updated": "2026-05-28T10:23:00Z"
    }
  ]
}
```

**Acceptance:**
- ✅ При недоступности CGR эндпоинт возвращает 200 с `status: "stale"` и последними данными
- ✅ В Prometheus `/metrics` есть счётчик `cgr_scoreboard_fetch_total{status="success|error"}`
- ✅ Если данные старше 60 минут — алерт в Slack #ops через Sentry
- ✅ После работы модуля хардкод `BORDERS` в `border_service.py` удалён

### 3.2. Привязка номера брони (FR-2)

**Сценарий:**
1. Водитель открывает международный рейс в UrTruck
2. На карточке рейса — виджет «Электронная очередь» с табло (FR-1)
3. Кнопка «Забронировать на CarGoRuqsat» вызывает `Linking.openURL()` (встроенный в React Native):
   ```
   https://cgr.qoldau.kz/ru/start?utm_source=urtruck&utm_medium=app&utm_campaign=booking_redirect
   ```
4. Открывается **системный браузер** (Safari/Chrome), **не WebView**
5. Водитель бронирует в их среде со своей ЭЦП/СМС
6. Возвращается в UrTruck **вручную** (CGR нашего deep-link не знает, callback'а не будет)
7. На экране возврата водитель видит подсказку: «Введите номер брони, который вам выдал CarGoRuqsat»

**Эндпоинт:** `POST /api/v1/borders/bookings` в `backend/api/borders.py`

```json
Request: { "trip_id": "uuid", "booking_number": "555-XYZ-2026" }
Response 201: {
  "booking_id": 1234,
  "verification_status": "pending",
  "message": "Проверяем номер брони..."
}
```

После создания — фоновая задача проверяет номер через парсинг `/registry/public-list`. Через 5-10 минут статус → `verified` или `not_found`.

**Acceptance:**
- ✅ Валидация формата номера брони (regex по результатам этапа 1.2)
- ✅ Один номер не привязывается к двум водителям (UNIQUE constraint)
- ✅ При `not_found` через 24 часа — push «Похоже, номер брони введён неверно»

### 3.3. Мониторинг статусов (FR-3)

**Cron:** каждые **15 минут**. Опрашиваются только брони со статусом `pending`, `verified`, `active`.

**Шаблоны push (через существующую систему UrTruck):**
- «Очередь сдвинулась: ваша позиция №12 (было №18) на Хоргосе»
- «До вашего выезда осталось ~2 часа на Калжате»
- «Ваша бронь активирована — выезд сегодня в 14:30»
- «Бронь отменена системой CarGoRuqsat»

**Acceptance:**
- ✅ Не более 1 push в час на одну бронь
- ✅ Локализация на язык водителя (RU, KZ, EN, CN минимум)
- ✅ В админке Перизат — история опросов брони

### 3.4. Парсинг чёрного списка (FR-4)

**Cron:** ежедневно в 03:00 (полное обновление, не инкрементальное).

**Алгоритм матчинга** (по результатам этапа 1.4):
1. Если CGR публикует ИИН → точный матчинг по `SHA256(ИИН + CGR_IIN_SALT) == iin_hash`
2. Если ГРНЗ → точный матчинг по нормализованному номеру
3. Если только ФИО → fuzzy через SQLite функции (`LIKE` + similarity по словам)

**При совпадении:**
- Запись в `cgr_blocklist_matches` со статусом `pending_review`
- **БЕЗ автоматического бана**
- Статус водителя в UrTruck → `🟡 На модерации` (не красный!)
- В админ-панели Перизат/Данияра — задача проверки

**Сообщение водителю:**
> «Ваш профиль временно ограничен. По результатам проверки в государственном реестре найдено совпадение. Если считаете это ошибкой — подайте апелляцию, рассмотрим в 48 часов.»

**НИКАКИХ** «вы заблокированы», «вы мошенник» и т.п.

**Acceptance:**
- ✅ Список тянется постранично, обрабатывается до 10 000+ записей
- ✅ В публичных API UrTruck **никогда** не отдаются данные третьих лиц из `cgr_blocklist`
- ✅ Журнал `cgr_blocklist_matches` хранится 1 год минимум

---

## 4. БЕЗОПАСНОСТЬ И PRIVACY (требования Марата)

1. **Все запросы к CGR** — с фиксированного IP сервера UrTruck (185.22.65.11). Не использовать резидентные прокси.
2. **User-Agent честный:** `UrTruck/1.0 (+https://urtruck.kz; partner-integration)`. Не маскироваться под Chrome.
3. **ИИН в SQLite** — только как SHA256-хэш с солью `CGR_IIN_SALT` из env. Чистый ИИН не сохраняем нигде. Ротация соли — раз в год (требует пересчёта).
4. **Журнал доступа** к `cgr_blocklist`:
   ```sql
   -- Только backend-сервис обращается к таблице. Если в логах APScheduler
   -- видны запросы из других модулей — Sentry alert.
   ```
5. **Логи:** ошибки CGR-запросов → Sentry. Тела ответов в Sentry не передавать (могут содержать чужие ПДн). Только метаданные: статус-код, URL, время.
6. **Удаление по запросу:** при удалении профиля водителя в UrTruck — каскадно удаляются `cgr_booking_status` и `cgr_blocklist_matches` для его `urtruck_user_id`. Требование Закона №94-V.

---

## 5. КОНФИГУРАЦИЯ (.env)

Добавить в `.env.example`:

```env
# CarGoRuqsat integration (Stream A)
CGR_BASE_URL=https://cgr.qoldau.kz
CGR_USER_AGENT="UrTruck/1.0 (+https://urtruck.kz; partner-integration)"
CGR_REQUEST_TIMEOUT_SEC=30
CGR_SCOREBOARD_INTERVAL_MIN=5
CGR_BOOKING_POLL_INTERVAL_MIN=15
CGR_BLOCKLIST_CRON="0 3 * * *"
CGR_IIN_SALT=<openssl rand -hex 32 — в secrets manager>
CGR_RATE_LIMIT_REQUESTS_PER_MIN=20
CGR_FEATURE_ENABLED=true

# Sentry (новое для проекта)
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## 6. ТЕСТИРОВАНИЕ

### 6.1. Unit-тесты (pytest)

В `backend/tests/cgr/`:
- `test_parsers.py` — каждый парсер тестируется на сохранённой фикстуре HTML/JSON из CGR (директория `fixtures/`). При смене формата CGR — тесты упадут, узнаем сразу.
- `test_client.py` — мок httpx, проверка ретраев, обработки 429/5xx, таймаутов.
- `test_blocklist_matching.py` — алгоритмы матчинга (exact ИИН, exact ГРНЗ, fuzzy ФИО) на синтетике.

**Coverage:** не менее **80%** на модуль `backend/cgr/`.

### 6.2. Интеграционные тесты

- Реальный запрос к CGR в read-only режиме
- Запуск в CI раз в день, не на каждый коммит (не нагружаем CGR)

### 6.3. Ручное тестирование

См. **`QA_CHECKLIST_CGR.md`** v1.1. Без подписей QA задача не закрывается.

**Критично (по QA_PROTOCOL.md):**
- ❌ Не принимать «всё работает» на словах
- ✅ Требовать доказательства: curl-логи, скриншоты push, SQL-выводы

---

## 7. МОНИТОРИНГ И НАБЛЮДАЕМОСТЬ

### 7.1. Метрики Prometheus (расширение существующего `/metrics`)

```
cgr_scoreboard_fetch_total{status="success"} 1234
cgr_scoreboard_fetch_total{status="error",code="429"} 5
cgr_booking_poll_total 567
cgr_blocklist_matches_total 12
cgr_request_duration_seconds_bucket{le="0.5"} 100
```

### 7.2. Sentry (новое)

- `sentry-sdk[fastapi]` подключается в `backend/main.py`
- DSN через `SENTRY_DSN` env
- Все исключения CGRException автоматически попадают в Sentry
- На критичные ошибки — алерт в Slack через Sentry интеграцию

### 7.3. Алерты в Slack

- CGR недоступен >30 минут подряд
- Rate limit (429) >5 раз за час
- Чёрный список не обновлялся >36 часов
- Найдено совпадение в чёрном списке → отдельный канал `#cgr-moderation` (не `#ops`)

---

## 8. ПЛАН РАБОТ (14 дней)

| День | Задача | Ответственный |
|------|--------|---------------|
| 0 | Мерж `claude/epic-goodall-7dR7Z` → main, синхронизация локальной копии, создание `feature/cgr-stream-a` | Claude Code + Бахитжан |
| 1 | Этап разведки, `docs/cgr/CGR_DISCOVERY.md` | Сергей |
| 2 | Утверждение схемы БД, `cgr_schema.sql`, `init_cgr_schema()`, seed `border_checkpoints` | Сергей + тех. лид |
| 3-4 | `CGRClient` + парсеры + unit-тесты | Сергей |
| 5-6 | `scoreboard_service` + APScheduler-задача + расширение `/api/v1/borders/scoreboard` | Сергей |
| 7 | Расширение `CargoRuqsatInfoScreen.js` — live-табло загруженности | Настя |
| 8-9 | `booking_service` + `/api/v1/borders/bookings` + опрос статусов | Сергей |
| 10 | Экран ввода номера брони + кнопка с UTM (Linking.openURL) | Настя |
| 11 | `blocklist_service` + ежедневная задача + интеграция в админ-панель | Сергей |
| 12 | Push-уведомления через существующую систему UrTruck | Сергей |
| 13 | Полное QA по `QA_CHECKLIST_CGR.md` | Перизат + Данияр |
| 14 | Багфиксы, релиз в staging, демо | Сергей |

**Production-релиз** — только после подписи Перизат и устного «ОК» Бахитжана.

---

## 9. ЧТО НЕ ДЕЛАТЬ (анти-скоп)

Это для Потока Б, не для этой задачи:

- ❌ Прямое бронирование через UrTruck («в 1 клик»)
- ❌ Премиум-подписка на автоматическое бронирование
- ❌ Хранение или обработка ЭЦП
- ❌ Биллинг государственной пошлины через UrTruck
- ❌ Любые операции, требующие авторизации в CGR от имени водителя
- ❌ Миграция SQLite → PostgreSQL (отдельный проект Фазы 2)
- ❌ Введение Alembic (отложено)
- ❌ `expo-web-browser` / WebView с CGR-страницей

При запросе «давай ещё это быстро докрутим» — эскалировать тех. лиду. Скоуп не растёт без отдельного ТЗ.

---

## 10. КОНТАКТЫ И ЭСКАЛАЦИЯ

| Вопрос | Кому |
|--------|------|
| Архитектура, неоднозначности | Бахитжан + Claude (тех. лид) |
| Юридические сомнения | Толя (advisor) |
| Безопасность, ИБ | Марат |
| UI/UX | Настя |
| QA блокер | Перизат |
| VPS / Supabase / nginx | Жанна (DevOps) |
| АО «ИУЦ» (Купанова Л.К.) | **только через Бахитжана**, не напрямую |

---

## ПОДПИСИ

- [ ] Сергей (Backend): ознакомлен __________ (дата)
- [ ] Настя (Frontend): ознакомлена __________ (дата)
- [ ] Перизат (QA): QA_CHECKLIST согласован __________ (дата)
- [ ] Марат (Security): требования ИБ согласованы __________ (дата)
- [ ] Жанна (DevOps): Sentry DSN и env-переменные настроены __________ (дата)
- [ ] Бахитжан (Product Owner): утверждаю __________ (дата)

**Конец ТЗ. Версия 1.1.**
