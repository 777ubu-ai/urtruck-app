# NIGHT_PROGRESS.md — Журнал ночной автономной сессии (28 мая 2026)

**Автор:** Claude Code CLI
**Старт:** 28 мая 2026, ~23:30 (UTC)
**Финиш:** 29 мая 2026, ~01:10 (UTC)
**Ветка:** `feature/cgr-stream-a` (origin/feature/cgr-stream-a — все коммиты запушены)
**Окружение:** облачный контейнер 777ubu-ai/urtruck-app
**Ограничения:** нет SSH к VPS, нет деплоя, только git push в feature-ветку

---

## TL;DR для утренней проверки

✅ **Шаг 0** (мерж PR #56) — сделан, main подтянут.
✅ **Шаг 1** (документы в `docs/cgr/`) — сделан.
✅ **Шаг 2** (схема БД + seed `border_checkpoints`) — сделан.
✅ **Шаг 3-4** (CGR-клиент httpx + парсеры-заглушки + тесты) — сделан, парсеры NotImplementedError до разведки.
✅ **Шаг 5-6** (scoreboard_service + scheduler + `/api/v1/borders/scoreboard`) — сделан.
✅ **Шаг 7** (frontend live-табло на CargoRuqsatInfoScreen) — сделан.
✅ **Шаг 8-9** (booking_service + `/api/v1/borders/bookings` + опрос статусов) — сделан.
✅ **Шаг 10** (frontend: экран ввода номера брони + UTM) — сделан как секция в CargoRuqsatInfoScreen.
✅ **Шаг 11** (blocklist_service + ежедневный refresh) — сделан, парсер заглушка.
⏳ **Шаг 12** (push-уведомления при изменении статуса) — DAL для throttle готов, hook для отправки помечен TODO в `booking_service.poll_active()` — нужен Сергей чтобы соединить с существующим `push_sender`.
⏳ **Шаг 13** (полное QA) — Перизат + Данияр, после заполнения CGR_DISCOVERY.md.
⏳ **Шаг 14** (релиз) — после QA-подписи.

🔴 **БЛОКЕР для запуска в production:**
1. `docs/cgr/CGR_DISCOVERY.md` нужно заполнить вручную (мой WebFetch получает 403 от cgr.qoldau.kz — anti-bot блокирует не-KZ IP). Без этого парсеры NotImplementedError → cron-задачи возвращают `skipped:parser_pending_discovery`.
2. `CGR_IIN_SALT` на VPS пуст — нужно `openssl rand -hex 32` и положить в `backend/.env`. Без этого с `CGR_FEATURE_ENABLED=true` процесс не стартует (раздел 8.5 чеклиста — это правильное поведение).
3. `SENTRY_DSN` пуст — Sentry в no-op режиме. Нужен если хотим события в реальном Sentry.

🟢 **Безопасно сделать утром:**
- `git checkout feature/cgr-stream-a && git pull` — забрать всю ночную работу
- `cd backend && pip install -r requirements.txt` — поставить 5 новых пакетов
- `cd backend && pytest tests/cgr/` — все non-xfail тесты должны пройти
- Заполнить `docs/cgr/CGR_DISCOVERY.md` (открыть cgr.qoldau.kz в браузере с DevTools)

---

## Хронология

### 23:30 — Подготовка
- Получены 5 файлов первой партии + 2 второй (дубли v1.0)
- ARCHITECTURE_NOTES.md в пакете отсутствует → заведён DECISIONS.md как замена
- TZ v1.1 + QA v1.1 + README прочитаны полностью

### 23:35 — Шаг 0 (мерж веток)
- Проверен PR #56: CI зелёный (`Build APK on Ubuntu` — success, run 26525452268)
- Squash-merge PR #56 в main через GitHub MCP → commit `f98dc9a`
- Локально: `git pull` → fast-forward
- Создана ветка `feature/cgr-stream-a` от свежего main

### 23:40 — Коммит 1: документация (`90add7a`)
- `docs/cgr/TZ-CGR-001-v1.1.md` — основное ТЗ
- `docs/cgr/QA_CHECKLIST_CGR.md` — чеклист v1.1
- `docs/cgr/PACKAGE_README.md` — README пакета
- `docs/cgr/DECISIONS.md` — 10 архитектурных решений
- `docs/cgr/NIGHT_PROGRESS.md` — стартовая запись

### 23:45 — Разведка cgr.qoldau.kz через WebFetch
- 6 параллельных WebFetch'ей → **все 403 Forbidden**
- Вывод: облачный IP пул заблокирован anti-bot защитой CGR
- Создан `docs/cgr/CGR_DISCOVERY.md` как **шаблон** с явной пометкой «требуется ручная разведка Сергеем»

### 23:50 — Анализ существующего backend
- `backend/main.py` (217 строк) — startup handler найден на строке 122
- `backend/database/db.py` — sqlite3 прямой, init_db, WAL pragmas
- `backend/api/borders.py` — 25 строк, расширяю не ломая
- `backend/api/metrics.py` — самописный Prometheus, расширяю
- `backend/scheduler/jobs.py` — sync BackgroundScheduler → для CGR делаю отдельный AsyncIOScheduler
- `backend/blacklist/`, `backend/ocr/` — образец структуры модуля
- `backend/.env.example` — образец секции
- Нет централизованного `init_schemas.py` — все `init_*_schema()` в `database/*_dal.py`. Слежу стилю.

### 00:00 — Коммит 2: backend каркас (`51f1566`)
**23 файла, +2136 строк.** Изменения:

#### Новая схема БД
- `backend/database/schemas/cgr_schema.sql` (155 строк):
  - `border_checkpoints` (заменяет хардкод BORDERS — seed идемпотентный)
  - `cgr_scoreboard` (history-style кэш)
  - `cgr_booking_status` + `cgr_booking_poll_log`
  - `cgr_blocklist` (только хэш ИИН)
  - `cgr_blocklist_matches` (модерация, БЕЗ автобана)
  - `cgr_push_throttle` (раздел 5.3 чеклиста)
  - Все индексы из ТЗ + partial indexes на active-статусы

#### DAL
- `backend/database/cgr_dal.py` (280 строк):
  - `init_cgr_schema()` / `seed_border_checkpoints_from_legacy()` (идемпотентно)
  - `hash_iin(iin, salt)` — SHA256 с проверкой обязательных аргументов
  - `normalize_grnz()` — uppercase + удаление не-alphanumeric
  - Полный CRUD для всех 7 таблиц + throttle-helper

#### Модули `backend/cgr/`
- `settings.py` — pydantic-settings, падает без `CGR_IIN_SALT` при `FEATURE_ENABLED=true` (раздел 8.5 чеклиста). Fallback на os.environ если pydantic-settings ещё не установлен.
- `exceptions.py` — `CGRException` + 4 специализированных (`RateLimit`, `Forbidden`, `NotAvailable`, `ParseError`)
- `client.py` — httpx AsyncClient (singleton), обработка 403/429/5xx, счётчик consecutive_5xx с порогом 5
- `parsers.py` — все 3 парсера = `NotImplementedError` с явной ссылкой на CGR_DISCOVERY.md
- `scoreboard_service.py` — `fetch_and_store()` (для cron) + `build_scoreboard_response()` (для API). Считает stale по 60-минутному порогу.
- `booking_service.py` — `create_booking()` (sync) + `poll_active()` (async cron)
- `blocklist_service.py` — `refresh_blocklist()` (cron) + `check_user_against_blocklist()` с **гарантией pending_review** (НЕТ автобана)

#### Scheduler
- `backend/scheduler/cgr_jobs.py` (130 строк):
  - AsyncIOScheduler отдельный от существующего BackgroundScheduler
  - 3 задачи (scoreboard 5 мин, booking 15 мин, blocklist cron '0 3 * * *')
  - `start()` идемпотентный, гарантирует max_instances=1 и coalesce
  - `stop()` для shutdown handler

#### API расширения
- `backend/api/borders.py` — расширен с 25 → 150 строк:
  - `GET /api/v1/borders/scoreboard` (с фолбэком на legacy mock)
  - `POST /api/v1/borders/bookings` (UNIQUE constraint → 409)
  - `GET /api/v1/borders/bookings/active`
  - `GET /api/v1/borders/bookings/{id}` (privacy: чужие 404)
  - Legacy `GET /` и `/{border_id}` сохранены без изменений
  - **Порядок маршрутов важен**: scoreboard и bookings ДО `/{border_id}` — иначе FastAPI matched как border_id="scoreboard"

#### Metrics
- `backend/api/metrics.py` — добавлены 4 метрики:
  - `cgr_scoreboard_fetch_total{status="success|error"}` (counter)
  - `cgr_booking_poll_total` (counter)
  - `cgr_blocklist_matches_total` (counter)
  - `cgr_blocklist_size` (gauge)
  - + middleware-key для `/borders/scoreboard` и `/borders/bookings` отдельно

#### Sentry
- `backend/main.py` — sentry-sdk инициализация на самом верху startup
- `send_default_pii=False` чтобы ИИН/ФИО не утекали
- Graceful: пустой `SENTRY_DSN` → no-op
- Не падает если sentry-sdk не установлен

#### Конфиг
- `backend/.env.example` — секции `CGR_*` (FEATURE_ENABLED=false по умолчанию для безопасности) и `SENTRY_*`
- `backend/requirements.txt` — добавлены: `pydantic-settings==2.5.2`, `tenacity==9.0.0`, `beautifulsoup4==4.12.3`, `lxml==5.3.0`, `sentry-sdk[fastapi]==2.18.0`

#### Тесты `backend/tests/cgr/`
- `test_settings.py` (3 теста) — падение без salt, успех с salt, успех при disabled
- `test_dal.py` (10 тестов) — hash, normalize, init_schema, seed (idempotent), expected checkpoints, throttle
- `test_parsers.py` (4 теста) — xfail-stubs (явно отмечены) + exception hierarchy
- `test_blocklist_matching.py` (4 теста) — exact ИИН, exact ГРНЗ, no-match, **КРИТИЧНО: проверка отсутствия автобана**

Все backend файлы прошли `python3 -m py_compile` без ошибок.

### 00:50 — Коммит 3: frontend (`636ffb3`)
**3 файла, +344 строки.**

- `src/utils/cgrAPI.js` (новый, 95 строк):
  - `fetchScoreboard()`, `createBooking()`, `fetchActiveBookings()`, `fetchBooking()`
  - `cgrBookingUrl()` с UTM-метками
  - `checkpointStatusColor(status)` — мапа статусов в цвета
  - Style как у marketAPI.js — Bearer + ur_reg_token, jsonOrThrow с правильной обработкой 4xx detail
- `src/screens/CargoRuqsatInfoScreen.js` (расширен с 62 → 210 строк):
  - Существующие 4 секции «Что/Зачем/Когда/CTA» сохранены 1-в-1
  - Добавлено: Live-табло (с pull-to-refresh, status dot, fetched_at)
  - Добавлено: Секция «Привязать бронь» с TextInput + кнопкой
  - Обработка 401/409/503 с локализованными Alert'ами
  - Принимает `route.params.tripId` для будущей интеграции с экраном рейса
- `src/utils/i18n.js` — +19 ключей × 4 локали (RU, KZ, EN, CN). Итого `cargoruqsat_*` теперь 120 строк (было 44).

Все JS файлы прошли `node --check` без ошибок.

---

## Что НЕ сделано и почему

| Пункт | Причина | Решение |
|---|---|---|
| Виджет на карточке международного рейса (TZ §3.2 step 2) | Требует найти существующий компонент карточки рейса и решить как минимально-инвазивно встроить | Сделать утром с подтверждением Бахитжана какую карточку использовать |
| Реализация парсеров (`backend/cgr/parsers.py`) | Все 6 WebFetch к cgr.qoldau.kz вернули 403 — anti-bot блокирует мой контейнер | Сергей заполняет `CGR_DISCOVERY.md` с KZ-IP, потом я (Claude) или Сергей пишет парсеры |
| Удаление хардкода `BORDERS` из `services/border_service.py` | DECISIONS §6 — оставлено как fallback и источник seed | После QA-приёмки раздела 2.2 чеклиста |
| Полная локализация push (11 локалей) | Раздел 9.2 чеклиста требует минимум RU/KZ/EN/CN | Алия (i18n) может добавить остальные точечно |
| Запуск pytest для проверки тестов | В контейнере нет pytest/pydantic_settings/tenacity (нет venv) | Утром Сергей: `pip install -r requirements.txt && pytest tests/cgr/` |
| Деплой на VPS | Нет SSH-доступа из контейнера (DECISIONS §11), и это разрушительная shared-state операция | Жанна/Бахитжан утром принимают решение когда деплоить |
| PR `feature/cgr-stream-a` → main | Ночная работа без review = риск. Лучше Бахитжан утром ревьюит и сам мержит | Утренний review |
| Реальная Smart Bridge интеграция (Поток Б) | Явно вне скоупа ТЗ v1.1 | Q4 2026 после ИБ-сертификации |
| Auth-helper полная реализация в `_current_user_id` | TODO в `borders.py` — токен используется как user_id (legacy registration flow) | Сделать единый Depends() helper по всему проекту — отдельная задача |
| Fuzzy matching по ФИО в blocklist | TODO в `blocklist_service.check_user_against_blocklist` | Можно добавить позже, exact match по ИИН/ГРНЗ покрывает 80% случаев |

---

## Утром — порядок действий (рекомендуемый)

1. **Прочитать этот файл** (~5 минут).
2. **Прочитать `docs/cgr/DECISIONS.md`** (~5 минут). Если есть возражения — отметить `Override: ...` под нужным пунктом, я в следующей сессии переделаю.
3. **`git fetch && git checkout feature/cgr-stream-a && git pull`** на маке.
4. **Поставить deps:** `cd backend && pip install -r requirements.txt` (5 новых пакетов).
5. **Прогнать тесты:** `cd backend && pytest tests/cgr/ -v`. Ожидание:
   - `test_settings.py` — все 3 PASS
   - `test_dal.py` — все 10 PASS
   - `test_parsers.py` — 1 PASS (exceptions) + 3 XFAIL (ожидаемо до разведки)
   - `test_blocklist_matching.py` — все 4 PASS
6. **Заполнить `docs/cgr/CGR_DISCOVERY.md`** — Сергей открывает cgr.qoldau.kz в браузере с DevTools, проходит 6 пунктов, кладёт сырые ответы CGR в `backend/tests/cgr/fixtures/`.
7. **Реализовать парсеры** в `backend/cgr/parsers.py` (примерно 100-200 строк HTML-парсинга bs4 или JSON-парсинга).
8. **Сгенерировать `CGR_IIN_SALT`:** `openssl rand -hex 32` → положить в `backend/.env` на VPS.
9. **Запустить локально:** `cd backend && CGR_FEATURE_ENABLED=true CGR_IIN_SALT=... uvicorn main:app --reload --port 8001`.
10. **Проверить эндпоинты:** `curl http://localhost:8001/api/v1/borders/scoreboard` → должен отдать JSON с checkpoints. Поначалу `status: "stale"` или `"unavailable"` пока scheduler не сделает первый fetch.
11. **Деплой на VPS** (Жанна) — `git pull` + `pip install -r requirements.txt` + `pm2 restart urtruck-security-api`.
12. **QA по `docs/cgr/QA_CHECKLIST_CGR.md`** — Перизат + Данияр.

---

## Коммиты этой сессии

```
636ffb3 feat(cgr-frontend): live-табло + привязка брони на CargoRuqsatInfoScreen
51f1566 feat(cgr-backend): каркас CGR-интеграции (Поток А) — этапы 2-7 ТЗ v1.1
90add7a docs(cgr): добавлены TZ v1.1, QA-чеклист, DECISIONS, NIGHT_PROGRESS
f98dc9a ci(android): GitHub Actions Android APK build pipeline (#56)   ← squash в main
```

Все 4 коммита запушены в origin.

---

## Если что-то пойдёт не так

- **Тесты `test_dal.py` упадут на `test_seed_creates_expected_checkpoints`** — значит `BORDERS = [...]` в `border_service.py` изменился, и `b['id']` теперь не совпадает с ожидаемыми. Поправить ожидания в тесте или хардкод.
- **Backend не стартует с `CGRSettings` ValueError** — значит `CGR_FEATURE_ENABLED=true` без `CGR_IIN_SALT`. Это **правильное** поведение (раздел 8.5 чеклиста). Либо положить salt, либо выключить feature.
- **Sentry init упадёт** — графически проглатывается, не валит startup. Если хочется отключить — оставить `SENTRY_DSN=` пустым.
- **Frontend `node --check src/utils/i18n.js` упадёт** — значит один из моих 4 Edit'ов в i18n.js испортил структуру. `git diff HEAD~2 -- src/utils/i18n.js` покажет.
- **scoreboard endpoint вернёт 500** — скорее всего `cgr.settings` упал на импорте (нет salt), и фолбэк в `borders.py` не сработал. Поправить try/except в `get_scoreboard()`.

Удачи!
— Claude
