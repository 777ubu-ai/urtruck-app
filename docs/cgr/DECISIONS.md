# DECISIONS.md — Архитектурные решения по интеграции CGR (Поток А)

**Дата:** 28 мая 2026
**Автор:** Claude Code CLI (ночная автономная сессия)
**Контекст:** ARCHITECTURE_NOTES.md из пакета не пришёл (только TZ v1.1, QA v1.1, README). Этот файл — замена: фиксирует решения, принятые самостоятельно во время реализации, чтобы Бахитжан утром мог их проверить, оспорить, скорректировать.

Каждое решение помечено: **status** (locked / open-to-debate), **rollback cost** (easy / medium / hard).

---

## 1. Источник истины архитектуры

**Решение:** `docs/cgr/TZ-CGR-001-v1.1.md` (секции 0/2/4/9) используется как полная архитектурная база — там покрыты контекст, файловая структура, безопасность, анти-скоп. Отсутствующий ARCHITECTURE_NOTES.md по факту дублировал бы эту информацию.

**Статус:** locked
**Rollback:** easy (если ARCH_NOTES пришлёт — сверим, скорректируем)

---

## 2. Sentry

**Решение:** Подключаем `sentry-sdk[fastapi]` в `backend/main.py`. DSN через `SENTRY_DSN` env. Если переменная пустая — Sentry не инициализируется (graceful no-op). Это новая зависимость в проекте (раньше Sentry не было — см. аудит).

**Альтернатива (отвергнута):** свой error tracker. Слишком дорого для нашего масштаба, Sentry бесплатен до 5k events/мес.

**Статус:** locked (требуется по разделу 7.2 ТЗ v1.1)
**Rollback:** easy (одна зависимость + 5 строк init)

---

## 3. Prometheus

**Решение:** Расширяем существующий самописный `/metrics` (`backend/api/metrics.py`) — добавляем CGR-счётчики в тот же defaultdict-based стиль. **НЕ** подключаем `prometheus_client` библиотеку.

**Аргумент:** существующий код работает, формат Prometheus exposition соблюдён. Добавление зависимости ради 4 новых счётчиков — over-engineering.

**Альтернатива (отложена):** миграция на `prometheus_client` — отдельный рефакторинг-задача, не в скоупе CGR.

**Статус:** locked
**Rollback:** easy

---

## 4. CGR_IIN_SALT хранение

**Решение:** В `backend/.env` (как и все остальные секреты UrTruck сейчас). В `.env.example` — placeholder. Сгенерировать боевой через `openssl rand -hex 32`, положить на VPS вручную (через ssh). Ротация — раз в год, требует пересчёта `iin_hash` (отдельный migration script).

**Альтернатива (отвергнута):** HashiCorp Vault / AWS Secrets Manager — у проекта нет инфры для этого, отдельный проект.

**Статус:** locked для MVP
**Rollback:** easy

---

## 5. Feature flag CGR_FEATURE_ENABLED

**Решение:** Через env (`CGR_FEATURE_ENABLED=true|false`), читается в `cgr/settings.py` при старте процесса. APScheduler-задачи регистрируются условно (`if cgr_settings.feature_enabled`). Эндпоинты — middleware-подобная проверка: если выключено → 503 Service Unavailable с понятным сообщением.

**Альтернатива (отвергнута):** runtime-flag в БД с hot-reload. Сложнее, и для MVP избыточно.

**Статус:** locked
**Rollback:** easy

---

## 6. Хардкод `BORDERS = [...]` в `border_service.py`

**Решение:** **НЕ удалять** в первой итерации. Seed `border_checkpoints` идемпотентный (`INSERT OR IGNORE`), хардкод остаётся источником seed. Удаление — после того как QA подтвердит что seed корректно положил данные в БД (раздел 2.2 чеклиста). До этого момента `border_service.py` может читать из обоих источников (БД при наличии, хардкод как fallback).

**Аргумент:** zero-downtime миграция. Если БД ещё не инициализирована при первом старте после деплоя — fallback на хардкод спасает.

**Статус:** open-to-debate (Бахитжан может настоять на полном удалении сразу, но это рискованнее)
**Rollback:** easy

---

## 7. Pydantic Settings

**Решение:** `pydantic-settings` для `CGRSettings` (как в TZ v1.1 раздел 2.6). Остальные модули UrTruck (`config.py`) пока используют `os.environ.get` — не трогаем (вне скоупа).

**Статус:** locked
**Rollback:** easy (можно переписать на os.environ за час)

---

## 8. Alembic

**Решение:** **НЕ вводим**. Используем `.sql + init_cgr_schema()` стиль как в существующих модулях (`marketplace_schema.sql + init_marketplace_schema()`, и т.д.). Это явно отмечено в анти-скопе ТЗ v1.1 раздел 9.

**Статус:** locked
**Rollback:** medium (если потом введём Alembic, baseline нужно будет восстанавливать)

---

## 9. httpx AsyncClient lifecycle

**Решение:** Один shared `httpx.AsyncClient` на процесс, инициализируется в `cgr/client.py` при импорте. Закрывается на `app.on_event("shutdown")`. Connection pooling даст эффект на пиках (≥3 запросов за секунду).

**Альтернатива (отвергнута):** клиент-per-request. Проще, но дороже по сокетам.

**Статус:** locked
**Rollback:** easy

---

## 10. Парсеры HTML/JSON

**Решение:** `parsers.py` — два набора функций:
- `parse_scoreboard_html(html: str) -> list[ScoreboardEntry]` — если SSR (определяется на этапе разведки)
- `parse_scoreboard_json(data: dict) -> list[ScoreboardEntry]` — если AJAX
- Симметрично для `blocklist`, `booking_status`

Зависимости: `beautifulsoup4`, `lxml` (для HTML); встроенный `json` (для JSON).

**Тесты:** каждая функция тестируется на фикстуре в `backend/tests/cgr/fixtures/` (сохранённый ответ CGR). При смене формата CGR — тесты упадут, узнаем сразу (раздел 6.1 ТЗ v1.1).

**Статус:** locked
**Rollback:** easy

---

## 11. (bonus) Что я НЕ начинаю без подтверждения

- ❌ **Деплой на VPS** — не делаю. Нет SSH-доступа из контейнера, и это разрушительная shared-state операция. Утром Бахитжан/Жанна решат когда деплоить.
- ❌ **Удаление хардкода `BORDERS`** — оставляю на момент QA-приёмки seed-миграции.
- ❌ **Push в main** — никогда. Всё в `feature/cgr-stream-a`.
- ❌ **Замена существующего `/metrics` на prometheus_client** — отдельный рефакторинг, вне скоупа.
- ❌ **Миграция SQLite → Postgres** — явно в анти-скопе ТЗ v1.1.

---

## Что делать утром

1. Прочитать этот файл целиком (~5 минут).
2. Если по любому решению есть возражение — отметить в этом же файле под решением «Override: ...» с обоснованием.
3. Я (Claude) на следующей сессии увижу overrides и переделаю.
4. Прочитать `NIGHT_PROGRESS.md` (отдельный файл) — что именно сделано/закоммичено.
