# PRE-FLIGHT: внешний фильтр кузова, закладки и распознавание контактов

- Задача: добавить текстовый фильтр произвольного типа кузова; проверить и сделать видимым состояние закладки; исправить ситуацию, когда неполный список контактов от источника перекрывает номера в тексте объявления.
- Branch/SHA: `fix/feed-live-count-import-20261027` / QA2 base `746a476cc8af53d1e83cce03a8c58cd5e040993f` (кандидат ещё не закоммичен на момент составления первоначального отчёта).
- Production SHA: UNKNOWN.
- Known-good: текущие контракты внешней ленты в `tests/e2e/external-freight-bookmarks.spec.js`, `tests/unit/externalFreightBookmarks.test.mjs`, `backend/tests/test_external_freight_feed.py`, `backend/tests/test_external_freight_vehicle_supply.py`. Физическая проверка на iPhone по этим скриншотам не проведена.
- Scope: `src/screens/ExternalFreightFeedScreen.js`, `src/components/externalFreight/ExternalFreightEntry.js`, `src/components/ui/v1/BookmarkButton.js`, `backend/api/external_freight.py`, `backend/database/external_freight_dal.py`, `backend/database/external_freight_connection.py`, `backend/services/external_freight_parser.py`, `backend/services/external_freight_queue_bridge.py` и связанные тесты. Изменение body-фильтра затрагивает только API внешней ленты и её отдельную SQLite БД.
- PROTECTED: Production-развёртывание и БД, обычные ленты грузов/машин и фильтры маркетплейса, сделки/FSM, авторизация и права доступа.
- Риски: некорректный SQL-фильтр произвольного текста или срыв пагинации; повторные сохранения при быстром нажатии; избыточное распознавание номера из текста. Меры: escaped substring-query с Unicode casefold, фильтр включён в cursor identity; кнопка закладки блокируется до ответа; существующая консервативная проверка числовых полей остаётся источником номеров.
- Checks: unit, backend external-feed/parser tests, Playwright external-feed bookmark/filter suite и web build по изменённым путям; physical iOS QA остаётся отдельно необходимой для утверждения поведения установленной сборки.
- Rollback: откатить только этот набор файлов на исходный SHA `3a53e8c3c1deb3bd881be686b989784ca38d29f4`; изменения SQLite-схемы не требуются; API остаётся совместимым со старыми клиентами, которые не передают `body_query`.
- Graphify: локальная AST-схема построена для исходного SHA; графовых артефактов в git не сохраняем.

## Результаты

- Backend: `test_external_freight_feed.py` + `test_external_freight_vehicle_supply.py` — 124 passed.
- Frontend unit: `externalFreightModel.test.mjs` + `externalFreightBookmarks.test.mjs` — 13 passed.
- Favorites contract — PASS; `npm run lint` — PASS (591 активных JS-файлов); `git diff --check` — PASS.
- Web export — PASS. E2E `external-freight-bookmarks.spec.js` — 31 passed, 2 failed: оба теста «Поделиться» не находят кнопку в свернутой карточке; проблема вне изменённых маршрута API/фильтра/контактов.
- QA2/Production deploy и физическая iPhone-приёмка не выполнялись. Screenshot-ы подтверждают UI-симптомы, но не дают source IDs для доказательства, что похожие карточки — дубликаты одного Telegram-поста.
- После предыдущего прогона расширен backend-тест пользовательского фильтра: добавлены проверки кириллического поиска, пагинации и старого cursor без нового поля. В этой сессии повторный `pytest` недоступен: прежнее виртуальное окружение отсутствует, а системный Python не содержит `pytest`; предыдущий результат 124 passed относится к прогону до этого расширения теста. `py_compile` изменённых Python-файлов и `git diff --check` проходят.
- 27.10.2026 после переноса на актуальный QA2 base адресные проверки: 124 feed/parser API-теста + 24 bridge/review regressions прошли на Python 3.12; frontend filter/bookmark unit — 13 passed; lint — 591 JS-файл; `npm run build:web` — PASS. Полный `npm run test:unit` на macOS завершился с 2 ошибками в unrelated `test_play_internal_sequential_version.mjs` из-за shell version-code проверки; остальные tests прошли. Релизный CI на Ubuntu ожидает отдельной проверки.
