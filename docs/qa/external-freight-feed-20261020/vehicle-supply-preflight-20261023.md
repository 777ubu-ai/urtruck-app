# Наполнение ленты машин — PRE-FLIGHT 23.10.2026

- Задача: измерить потери за 24/120 часов, исправить подтверждённые причины слабого наполнения машин и доказать автоматическую доставку обеих категорий.
- Branch: `fix/external-feed-vehicle-supply-20261023`; исходный/base SHA `734e7757717c4fdecdc80d79ca8da3e2eee292b3`.
- Known-good: QA2 deploy run `39912284351` подтверждает этот backend SHA и online backup; APK `214494469`, SHA-256 `f51bb80916ed27811e305c4b5470fa9324055de0d0a8ee6892c24b1e4b2659b1`. ADB 23.10 подтверждает `214494469` на Huawei `3DJ0224B04002582` и Xiaomi `BUA6JB99T465Q49X`. Владелец подтвердил работу приложений; полнота наполнения и круглосуточная доставка ещё не приняты.
- Production SHA/runtime: UNKNOWN, production не изменяется в диагностике. Подготовка production-кандидата выполняется адресным PR после QA2-приёмки.
- Scope: существующий collector `ops/telegram-feed/feed.py`, parser/classifier, bridge/adapter и отдельная БД внешней ленты; конкретный список правок определяется после read-only аудита.
- Protected: основные грузы/машины/рейсы, сделки, чат, auth/роли, расходы, push, GPS/карта, AI, существующие Telegram-публикации и рабочие данные. Второй Telegram-reader не запускается.
- Checks: read-only снимки трёх SQLite, сопоставление source/app_messages/outbox/feed, причины исключений по источникам за 24/120 часов; реальные обезличенные регрессии; ограниченный replay только актуальных записей; наблюдение штатных циклов/сбоев; физическое автообновление двух ролей с фильтрами и позицией.
- Риски: ошибочная классификация/разделение контактов, дедупликация разных объявлений, повторное одобрение review, продление TTL, потеря outbox/cursor и нарушение Telegram-публикатора. Диагностика не изменяет очередь/сессии/состояние доставки.
- Rollback: до изменения runtime — приватные online backup отдельных SQLite с integrity check, код и effective unit/drop-ins. Откат кода/конфигурации в безопасной паузе существующих служб. Новые рабочие БД поверх старыми снимками не заменять. Pending outbox и актуальные source identities сохранять.

## Первичная фиксация runtime

23.10.2026 07:43 UTC: collector active/enabled, PID 1680403, NRestarts=0, старт 06:20:46 UTC; bridge timer active/enabled, штатный режим `EXTERNAL_FREIGHT_SOURCE_MODE=incoming`. Историческое ограничение published-only уже не описывает текущий runtime. Collector SHA-256 `2fc9a380986b5e26a70147def8163fbd4d43ea5675dd2278322c89d0bf208162` отличается от репозиторного файла; существующий runtime hotfix сначала сверяется и сохраняется.

Приватные исходные снимки и контакты не коммитить. Публичный отчёт содержит только агрегаты и обезличенные доказательства.

## Дополнительный PRE-FLIGHT: приоритет свежих публикаций

Branch `fix/external-feed-vehicle-supply-20261023`, исходник `27bffc95`, runtime QA2 `84e8ef7b`. PR578 прошёл независимое Security Review и 3/3 CI, deploy39924498189 SUCCESS; это не переносит PASS на следующий патч. После включения app_history реальные свежие сообщения ожидали разбора более пяти минут. Изолированная регрессия с 60 записями старого хвоста, 60 поздно принятыми историческими записями и одной свежей публикацией падает: свежая не входит в партию50. Причина: updated_at DESC отдаёт10 приоритетных мест backfill. Scope — только ORDER BY головы IncomingQueueBridge и регрессионный тест. Выбор по source_date DESC защищает свежую публикацию; старый хвост/правки по updated_at ASC остаются, MAX_SCAN50 сохраняется. Основной продукт, auth, Telegram queue/reader, mobile не меняются. Checks: связанный набор bridge/parser/collector/API, Security Review нового SHA, CI и измерение живой задержки. Rollback: вернуть только bridge.py из свежей приватной копии; runtime SQLite не откатывать назад.

## Конкретные файлы патча

- `backend/services/external_freight_classifier.py`: смысл предложения/запроса машины, границы слов и сохранение review смешанных текстов.
- `backend/services/external_freight_parser.py`: явно указанные места/направления, локальный контакт и количество машин; без AI/конвертации/догадок о стране.
- `backend/services/external_freight_queue_bridge.py`: версия повторного разбора и причины review; прежняя QA2-изоляция/ACK/retry сохраняются.
- `ops/telegram-feed/feed.py`: отдельный ограниченный app_history той же сессии; без изменения Telegram queue/cursors/публикаций.
- `backend/tests/test_external_freight_vehicle_supply.py`, `backend/tests/test_external_freight_continuous.py`: содержательные регрессии и проверка отдельного history-запроса при сохранении прежнего forward cursor.
- `docs/qa/external-freight-feed-20261020/vehicle-supply-*`: агрегаты, условия измерения, проверки и ограничения.
