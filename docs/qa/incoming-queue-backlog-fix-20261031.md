# QA: накопление очереди incoming и подтверждение импорта

Дата: 2026-10-31. Production, Telegram source queue и объявления не изменялись.

## PRE-FLIGHT

- Branch / исходный HEAD: `fix/urtruck-feed-audit-20261030`, `5171dc794905c7e332a503ecddd005bc51f52cef`.
- QA2 установленный SHA: `.qa-source-sha` подтверждает `4a524b31ac97d8ecd57e7463352160244fe7a41b` (`Внешние ленты: срок 10 дней и очистка истёкших карточек (#647)`). QA2 — не Git checkout. SHA-256 установленных модулей до исправления: adapter `960eda356758c2191507b2b565e0841834fb1bd0189f1641c99d639d366642f8`, bridge `99147c562d8c89faedc1d718b5c152bb437635cfc729e01d7f723751021d6433`.
- Known-good: live API и импорт работали на этом QA2 SHA; в обследованном часу 45 importer-запросов завершились HTTP 200. Полной доставки это не доказывает: 13 bridge-запусков не зафиксировали ACK.
- Scope: только `backend/services/external_freight_import_adapter.py`, `backend/services/external_freight_queue_bridge.py` и backend-тесты. Защищены Telegram collector/source DB, Production, пользовательские объявления, магазины и публичные каналы.
- Checks: Graphify выполнен до правок; адресные feed/bridge/owned regression tests, синтаксис Python, `git diff --check`. Для приёмки QA2 нужны точный deployed SHA, backup QA2 state DB и два часовых замера после штатного QA2 deploy.
- Rollback: вернуть только два backend-модуля к предыдущим файлам/commit и перезапустить только QA2 feed bridge штатным QA2 release-flow. Новые SQLite-столбцы additive; строки не удаляются. Перед deploy сделать SQLite online backup `external-feed/adapter.sqlite3`; при откате код старого формата игнорирует дополнительные колонки. Не восстанавливать старую базу поверх текущей.

## Диагноз по live QA2 до исправления

Наблюдаемый интервал: `2026-10-30 20:16:38–21:17:06 UTC`.

| Поток / показатель | До исправления |
|---|---:|
| Incoming bridge runs | 42: 29 `delivered`, 13 `retry_scheduled` |
| Source messages scanned | 2 100 (50 за запуск) |
| Outbox segments enqueued | 1 950 |
| Подтверждённые доставки adapter | 1 450 |
| Retry-вызовы | 13, `sent=0` |
| Изменение pending за час | около +500 |
| Owned | 3 сообщения, 7 сегментов, 7 подтверждений, pending 0 |
| QA2 importer access log | 45 POST, все HTTP 200: 42 incoming + 3 owned |
| Systemd service runs | медиана 82.0 с, максимум 92.2 с; интервал запусков медианно 84.3 с; `busy=0` |
| Таймер incoming | override `OnUnitInactiveSec=2s`; реальная производительность ограничена длительностью service, а не частотой таймера |

Установленный тогда outbox: 141 030 строк, 137 330 в состоянии доставлено, 3 700 pending, 3 697 due, 3 в backoff, quarantine 0. Из pending 115 уже старше 10 дней; 114 из них также попадали в прежний due-счётчик, хотя код отбора не мог отправить их по TTL. Реальный due, не истёкший по TTL, — 3 583; после исключения истёкших из pending остаются 3 585 строк, включая 2 неистёкшие строки в backoff. Истёкшие строки и payload сохранены.

### Разбор 13 повторов

Старый journal не записывал row/request ID, exception class и request duration. Поэтому метки `R01`–`R13` ниже — номера событий в порядке времени, а не идентификаторы объявлений; отдельные исторические row IDs восстановить нельзя. У каждого события bridge-лог содержал `http_status=null`, `sent=0`; ближайший endpoint access log содержал HTTP 200. Повторяемые задержки дают максимальную попытку в пачке по тогдашней формуле `5 × 2^(attempt−1)`. Попытки отдельных строк внутри пачки журнал не сохранял.

| ID события | UTC | HTTP в access log | HTTP в bridge log | Error class в старом журнале | Delay | Макс. attempt в пачке |
|---|---|---:|---:|---|---:|---:|
| R01 | 20:19:42 | 200 рядом по времени | отсутствует | отсутствует | 80 с | 5 |
| R02 | 20:24:07 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R03 | 20:29:57 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R04 | 20:31:27 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R05 | 20:36:57 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R06 | 20:38:23 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R07 | 20:43:59 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R08 | 20:51:05 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R09 | 20:55:14 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R10 | 21:00:59 | 200 | отсутствует | отсутствует | 80 с | 5 |
| R11 | 21:09:23 | 200 | отсутствует | отсутствует | 160 с | 6 |
| R12 | 21:13:24 | 200 | отсутствует | отсутствует | 320 с | 7 |
| R13 | 21:14:42 | 200 | отсутствует | отсутствует | 20 с | 3 |

Причина ACK-повторов подтверждается контрактом кода: importer может вернуть HTTP 200 с `result="expired"`, но старый adapter принимал только `created/updated/replayed`. Любой такой элемент делал ACK всей пачки недействительным (`invalid_import_ack`), после чего все строки пачки повторялись. В таблице tombstones за тот час появилось 170 новых записей `expired`; это согласуется с причиной, но старый runtime не связывал конкретный tombstone с конкретной попыткой. Нельзя утверждать, что все 13 пачек содержали expired-результат. Наблюдаемый `http_status=null` ожидаем для `ValueError` без атрибута HTTP code; сам exception class старый журнал не сохранил.

Другая причина отставания: source-query использовал `app_messages_published` и primary key `incoming_bridge_seen`; `EXPLAIN QUERY PLAN` подтвердил индексный проход без временной сортировки. При этом bridge делал отдельные SQLite write transaction для каждого outbox сегмента и source/dedup ACK на каждое сообщение. На 297-МБ state DB с `journal_mode=DELETE`, `synchronous=FULL` 42 запуска в час занимали почти всё доступное время, несмотря на 2-секундный таймер. `busy=0` исключает конкуренцию lock как ограничитель в этом срезе.

## Изменения кандидата

- HTTP 200 ACK принимает `expired` как подтверждённый терминальный результат. Такой результат не учитывается как доставка и не повторяет остальные элементы пачки.
- Старые outbox-записи старше десяти дней получают additive `terminal_at/terminal_reason`; payload сохраняется, физического удаления нет. `pending`, `ready_pending`, `expired_pending` и `terminal_expired` разделены; истёкшие не считаются готовыми.
- Входные сегменты записываются одной SQLite-транзакцией на запуск. `incoming_bridge_seen` и dedup ACK записываются только после durable outbox commit, чтобы сбой не потерял source сообщения. Неизменившиеся сегменты различаются от новых и обновлённых.
- Bridge логирует `source_scan_ms`, `parse_ms`, `outbox_write_ms`, `source_ack_ms`, `flush_ms`, `bridge_duration_ms`, `lock_wait_ms`; adapter логирует длительность HTTP, HTTP status/error class, confirmed outcomes, попытку, backoff и keyed pseudonymous row ID без payload/контактов.
- Неизменившаяся запись остаётся `unchanged` и не сбрасывает попытки/ACK. Существующие тесты replay/dedup продолжают проходить.

## Результаты проверки кандидата

- `py_compile` затронутых Python-модулей: PASS.
- Backend feed/bridge/owned/continuous/review/target/vehicle-supply tests: 275 PASS, 0 FAIL.
- `git diff --check`: PASS.
- Предупреждения pytest: 3 deprecation warnings в тестовых зависимостях/старом `utcnow`; к исправлению очереди не относятся.

## Установка и контроль после изменения

QA2 не менялся. Текущий live SHA остаётся `4a524b31ac97d8ecd57e7463352160244fe7a41b`; новый SHA ниже будет только кандидатом до штатного QA2 deploy. Нельзя считать поток восстановленным до проверки установленного SHA, двух последовательных часовых измерений ready/pending/confirmed/duration и фактических новых карточек через QA2 API. Production не развёртывался.
