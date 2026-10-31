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

## FEED-04.1: повторная проверка кандидата и блокер QA2

- Branch/base на повторной проверке: `fix/urtruck-feed-audit-20261030`, исходный HEAD `56a51a13d90fff59ce705205bef1819a1719c6ce`, base `qa2/integration-candidate`=`a0af68b7743469f7f163ebaa41c4a40ac5e464a4`. PR #660 остаётся open/draft.
- Код исправления очереди находится в commit `b465a038c4c4c5d28433d9a09e378ce829ccb200`; FEED-04 classifier/retention изменения добавлены последующими коммитами этой ветки. QA2 до установки всё ещё на backend `4a524b31ac97d8ecd57e7463352160244fe7a41b`; installed adapter/bridge SHA-256 остаются `960eda356758c2191507b2b565e0841834fb1bd0189f1641c99d639d366642f8` / `99147c562d8c89faedc1d718b5c152bb437635cfc729e01d7f723751021d6433`.
- Повторный локальный прогон на рабочем дереве после добавления диагностики health: 397 адресных backend pytest PASS, 0 FAIL; 3 прежних deprecation warnings. `py_compile` для adapter, bridge и health PASS; `git diff --check` PASS. Это не GitHub CI и не установка.
- Подтверждённая блокировка CI: run `41190242310` завершил обязательные jobs до шагов; GitHub annotation буквально сообщает: `The job was not started because your account is locked due to a billing issue.` У jobs пустые `steps` и нет `runner_name`. Необходимое действие владельца — устранить billing lock GitHub-аккаунта/организации, где находится `777ubu-ai/urtruck-app`, затем повторить Quality Gate PR #660. Не отключать gate и не обходить его прямой заменой файлов.
- Проверен read-only процесс штатной установки: `deploy-qa2-final-integration.yml` устанавливает весь backend, web и AI, а `qa2-feed-bridge-2s.yml` относится к таймеру/Telegram collector и не устанавливает два bridge-модуля. Ни один из них пока не применён к PR-кандидату; до CI и безопасного согласованного продвижения на `qa2/integration-candidate` QA2 не изменяли.
- QA2 read-only срез `2026-10-31T11:03:48Z`: incoming ready 9 676, backoff 0, eligible 9 676, expired-pending 228, quarantine 0; последняя доставка `11:02:25Z`. Owned pending/quarantine 0; последняя доставка `11:00:53Z`. Collector active, published progress 7 290, source errors 0; health timer active, внешняя пауза не обнаружена. Это не доказывает разгрузку.
- В health snapshot `11:03:37Z` поле `ready=9 891` не исключало истёкшие записи: `pending=9 904`, из них 228 expired-pending и 13 backoff на момент среза. Поэтому health завысил ready относительно пригодной к отправке очереди на 215. Установленный health.py старее кандидата и не показывает отдельные backoff, oldest-ready age и подтверждённые строки за час.
- В рабочем дереве FEED-04.1 добавлено расширение существующего health-снимка: ready, backoff, expired-pending, terminal-expired, oldest-ready age, строки с последним подтверждением за час, поступившие сообщения и прогресс этапов. Существующая частота контроля и ограниченный restart watchdog не менялись. Добавлены четыре теста для мигрированной/старой схемы, backoff без ложного stalled и backlog alarm при недавней доставке. Новые изменения пока не установлены на QA2.

**Статус:** причина повторов подтверждена, исправление очереди проверено локально; локально исправлен и расширен health-контроль. QA2 deploy, два часовых замера после установки и проверка видимых клиентских карточек BLOCKED до снятия GitHub billing lock и прохождения штатных release gates. Производство и очереди не изменялись.

## FEED-04.2: восстановленные regression-тесты и подготовка узкого deploy

- В процессе проверки обнаружено, что прежний `test_telegram_feed_health.py` был заменён snapshot-тестами. Старый regression-набор восстановлен без изменения, четыре новых snapshot-теста вынесены в отдельный `test_telegram_feed_health_snapshot.py`; удалённого coverage не осталось.
- Адресная локальная регрессия classifier/parser/bridge/adapter/API/DAL/health/scheduler после восстановления тестов: 360 PASS, 0 FAIL; 4 deprecation warnings. Это повторный профильный набор на текущем локальном рабочем дереве, не CI и не серверный прогон.
- Добавлены узкие workflow и инструкция: `.github/workflows/deploy-qa2-external-feed.yml`, `scripts/qa/deploy_external_feed_candidate.sh`, `docs/qa/feed-04.2-qa2-deploy.md`. Workflow требует точный SHA, уже продвинутый в `qa2/integration-candidate`, адресные тесты и полный `quality-gate-reusable.yml`; деплой требует QA2 environment approval. Скрипт делает online backup трёх SQLite DB и копию затрагиваемого кода, ставит только компоненты внешнего feed и восстанавливает только код при ошибке. Данные не откатываются поверх более новых записей. QA2 workflow фактически не запускался.
- Проверка контракта нового workflow: 2 PASS. `bash -n` deploy-скрипта, `py_compile` скрипта бенчмарка и health, YAML parse workflow: PASS. Это статическая/локальная проверка, не GitHub Actions.
- Воспроизводимый synthetic mock benchmark сохранён в `docs/qa/feed-04-metrics/local-adapter-ack-benchmark.json`. Сравнение установленного baseline `4a524b31ac97d8ecd57e7463352160244fe7a41b` и bridge/adapter кандидата `56a51a13d90fff59ce705205bef1819a1719c6ce`, одна пачка: 50 сегментов, API fixture `49 created + 1 expired`, два flush. Baseline: 2 API-запроса, 100 SQLite write statements, 2 transactions, 10.661 ms суммарно, 50 pending после повторов. Кандидат: 1 запрос, 52 write statements, 3 transactions, 7.177 ms, 0 pending и 1 terminal expired. Таймер сна внутри mock-запроса около 3 ms на запрос. Это только локальный детерминированный mock; он подтверждает семантику ACK и снижение повторной пачки, но не измеряет реальную производительность QA2.
- Тесты classifier/parser/bridge уже покрывают обезличенные synthetic формы: грузы и машины, несколько маршрутов, контакты в конце поста, разные контакты по блокам, отсутствие необязательных полей, повторы/дедупликацию и границы TTL. Независимая ручная разметка реальных обезличенных сообщений и видимость карточек на клиенте пока не завершены; synthetic tests не выдаются за неё.
- Для установки нужны снятие GitHub billing lock, успешный Quality Gate PR #660 и продвижение выбранного commit в `qa2/integration-candidate`; merge/deploy не выполнялись. После установки остаются два часовых замера, фактическая проверка обеих лент и физическая приёмка экранов/кнопок. Production не менялся.
