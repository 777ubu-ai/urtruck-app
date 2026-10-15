# Поиск и capacity — follow-up кандидата PR537

Дата: 2026-10-15, Asia/Almaty. Работа изолирована от release/store и production.

## Источник и область

Изменения основаны на `fix/marketplace-capacity-20261015` HEAD `f975e450cae9bb44a9e2217bd382c54af3605f51`, PR537; base PR536 `1080523a04a931dfe4465805e80c4a99c0e4b506`. До правок отдельный worktree был чистый. Production source — `UNKNOWN_MIXED`. Магазинные IPA99/AAB214116271, Apple submission и сервер не менялись.

Область: публичные `/cargos` и `/trips`, их API client, две feed-ленты и пакетное обогащение рейтинга водителей. Auth, push/outbox, unread/cache, chat/documents, FSM/roles, GPS/maps, storage, real user data, schema migrations, native builds и release workflows не менялись. SQL schema/indexes не менялись: `EXPLAIN QUERY PLAN` показал, что избранное уже использует уникальный индекс `(user_id,item_type,item_id)`; новый дублирующий индекс не добавлялся.

## Найденные причины и изменения

- Цена и даты раньше сортировались/фильтровались лишь по уже загруженным карточкам. Теперь даты и числовой диапазон применяются сервером до `LIMIT/OFFSET`; сортировка цены стабильно завершается `published_at,id`. Для цены требуется одна валюта USD/KZT/RUB/CNY, иначе разные валюты не сравниваются по неподтверждённому курсу. Пустые price параметры не отправляются как пустые числа. Неверные даты/цены дают 422 на API и локализованную подсказку в фильтре.
- «Избранное» теперь фильтруется на сервере по `user_id` из валидного bearer, `item_type` и listing ID; анонимный запрос получает 401. Передавать ID другого пользователя нельзя. Ответ добавляет `page_count`, `has_more`, `search_contract=1`, сохраняя legacy поля `total` и `next_offset`. Клиент с расширенными фильтрами fail-closed, если подключённый backend не предоставляет новый контракт.
- Публичные trips раньше выполняли проверку верификации и запрос рейтинга отдельно для каждого рейса. Теперь страница получает статусы водителей и рейтинговые агрегаты пакетными запросами, сохраняя видимость отзывов, среднее, distribution и нулевой summary.
- Обе ленты используют серверную выдачу, одну sticky-шапку `FlatList`, сбрасывают старый запрос/позицию при новом scope, сохраняют offset при возврате из карточки и дают кнопку «Наверх». Расширенный sheet редактируется draft-состоянием и применяет диапазон одним действием.

## Доказательства

- Reproducer для server-side date/price filters, currency scoping, invalid ranges, owner-scoped favorites, stable price pages и favorites за первой страницей: `backend/tests/test_public_feed_search_filters.py`.
- Scalar/batch rating equivalence: `backend/tests/test_reviews_rating_summaries.py`.
- Frontend offset/error/stale-response/advanced-query contracts: `tests/frontend/test_public_feed_pagination.mjs`; sticky feed contract: `tests/frontend/test_cargo_feed_collapsible_header.mjs`; совместимость фильтров: `tests/frontend/test_status_push_pro_filter_contract.mjs`.
- Локальная canonical backend suite через `scripts/run_backend_tests.sh --isolated --disable-warnings` завершилась с exit 0 (Python 3.12, отдельная DB на каждый test file). Отдельный затронутый прогон: 20 passed.
- Полный `npm run test:unit`: 1207 passed, 0 failed. Целевые feed/API frontend tests: 24 passed. `npm run lint`: 502 active JS файлов parsed. `npm run qa:i18n`: RU/EN/KK/ZH missing 0. `npm run build:web`: PASS, 8 обязательных статических источников. `git diff --check`: PASS.
- Изолированный probe `scripts/qa_capacity_probe.py` на Mac: синтетические 5000 cargo + 5000 trips, по 100 страниц, 5000 профилей каждой роли в distributed-сценарии; вся выдача без повторных ID. Отдельный `capacity.json` фиксирует source base и SHA текущего diff на момент прогона, локальный temp DB, отключённую исходящую сеть и метрики. Это последовательный in-process ASGI, не VPS/production load, не 10k одновременных пользователей и не физический телефон.
- SQLite `EXPLAIN QUERY PLAN` для активного фильтра цены/даты: используется `idx_cargos_status` / `idx_trips_status`, затем `USE TEMP B-TREE FOR ORDER BY`. При 5k synthetic данных это измерялось локально; производительность на большей production-базе и индексный выигрыш не установлены. Для favorites коррелированный lookup использует имеющийся уникальный индекс.
- Независимый security-focused review точного итогового diff HEAD `f242523ae6ff89281d7586eda9baa7f313f972be` против base `f975e450cae9bb44a9e2217bd382c54af3605f51` завершён: P0/P1/P2 не обнаружены, включая финальные UI-изменения. SQL-параметры связаны безопасно, избранное ограничено текущим пользователем, allowlist статусов сохранён. Стоимость выражений фильтрации/сортировки на представительной большой базе остаётся не измеренной нагрузкой, но review не установил дефекта.

## Ограничения и открытые проверки

- Публичный `total` остаётся legacy числом видимых записей страницы; общий размер выдачи не утверждается. Новый UI должен использовать `has_more`/`next_offset`, а не трактовать `total` как полный count.
- Использована существующая текстовая фильтрация городов и парные country-поля. Полная нормализация alias/городских идентификаторов, транзитных городов и одноимённых населённых пунктов этим patch не заявляется.
- Offset-пагинация гарантирует последовательность для неизменяемого набора; snapshot semantics при конкурентной публикации/снятии не добавлены. Keyset-пагинация не вводилась.
- JS-список продолжает накапливать загруженные записи. Desktop Chromium/DOM mounted-card/heap measurements не заменяют native RSS/PSS и длительную проверку. Лимит удерживаемых страниц не выбран без измерений OPPO/Huawei/iPhone; безопасное window/reload с anchor пока не реализовано.
- Персональные 8.32 MB seed на VPS не использовались; их запуск на общем сервере заблокирован. Ранее зафиксированы неизвестное назначение `xmrig` PID 2310531, load выше CPU capacity и почти полный swap. Процесс/сервер не менялись; стресс-тест и новый сервис не запускались.
- Физические устройства, реальная сеть и production не проверялись. Это SOURCE/LOCAL CAPACITY evidence, не DEVICE/PRODUCTION acceptance.

## Откат

Изменения ограничены этим candidate branch поверх PR537. Откат — revert собственных commits/закрытие draft PR после review; runtime, миграций и данных для отката нет. PR536/537/538 и frozen release worktrees остаются отдельными.
