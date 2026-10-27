# PRE-FLIGHT: аудит фильтров внешней ленты и контактов — 2026-10-27

- Branch/SHA: `fix/my-listings-retention-30d-20261027` / `04b88d40b3ece24fc139a62184c3ab9896879939`.
- Known-good: существующие проверки `backend/tests/test_external_freight_feed.py`, `backend/tests/test_external_freight_vehicle_supply.py`, `tests/unit/externalFreightModel.test.mjs` и `tests/e2e/external-freight-bookmarks.spec.js`; физическая приёмка новых изменений на iPhone не подтверждена.
- Scope аудита: верхние фильтры внешней ленты (откуда, куда, кузов/произвольный текст, дата, цена), курсор/постраничная загрузка, серверная сортировка и извлечение контактов в `src/screens/ExternalFreightFeedScreen.js`, `src/utils/externalFreightModel.js`, `src/utils/externalFreightFeed.js`, `backend/api/external_freight.py`, `backend/database/external_freight_dal.py`, `backend/services/external_freight_parser.py`.
- PROTECTED: Production и QA серверы/БД, Telegram-публикации и очереди, обычные ленты, сделки и другие несвязанные локальные изменения.
- Checks: адресные backend/feed/parser тесты, frontend model tests, e2e фильтров при доступном окружении, `git diff --check`; реальные данные не запрашивать и не менять.
- Rollback для аудита: убрать только этот QA-документ. Отдельный минимальный parser-патч ниже ограничен `backend/services/external_freight_parser.py` и его backend-тестом; откатить его можно возвратом этих файлов к зафиксированному исходному SHA. QA2/Production не затрагиваются.

## Результаты

Ожидают выполнения адресных проверок.

- Backend feed/parser suites before parser change: **149 passed**; after parser change: **151 passed** (Python 3.12 isolated QA venv).
- Frontend model/bookmark/filter unit checks: **14 passed**.
- Playwright synthetic UI checks for route, all five filters, price-sort fallback and continuous refresh: **10 passed**. These use synthetic API responses; they do not establish counts in the live feed.
- Current code audit: route fields are filtered by folded prefix on parsed `origin`/`destination`; body uses known type or case-insensitive escaped text search; date bounds are applied to source publication timestamps; cheapest/most expensive uses keyset cursor pagination for known prices in a single currency. For mixed currencies the server explicitly falls back to newest; unpriced rows are excluded from price sorting. Mobile/web list pagination is wired to `next_cursor` and is not hard-coded to three rows.
- Synthetic phone probe before patch: 7–8 digit standalone numbers in the final three non-empty lines are recognized; the same standalone number earlier in a long post is not. Explicit `Телефон`/`WhatsApp` context allows 7–8 digit numbers anywhere. After the patch, dedicated regressions verify standalone 7–8 digit numbers are retained outside the footer while 6-digit mid-post values remain rejected; numeric price/weight/date and order-ID guards remain active.
- Реальные записи QA2/Production и Telegram не читались и не изменялись.

## Итог

Фильтры технически проходят текущие тесты. Код не ограничивает выдачу тремя карточками: первая страница до 30 записей, далее используется `next_cursor`. По скриншотам без доступа к фактическому ответу сервера нельзя доказать, что после трёх карточек есть ещё записи, подходящие одновременно по направлению и цене. Подтверждённая неполнота распознавания контактов: короткий отдельный номер вне нижних трёх строк теряется, если в строке нет подписи телефона. Минимальный локальный parser-патч устраняет этот пропуск без изменения маршрутизации, фильтров или серверных данных.
