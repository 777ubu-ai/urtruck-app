# Изоляция внешней ленты — исправленный diff

Продуктовая база: `8ff9a280443438e3fce7584ed946239bbcd271f1`. База текущего PR: `64cdf1c25f1fec723c7db242da630d2270f05940` (устарела относительно продуктовой базы). Исходный HEAD задачи: `a1b15465`; восстановление утверждённой базы выполнено отдельным merge `e9cff272`.

## Причины и исправления

- Сравнение только с базой PR скрывало отсутствие утверждённых расходов, account/session recovery и идемпотентной публикации. Интегрирован исходный `8ff9a280` без переписывания. 29 защищённых файлов теперь совпадают с ним по SHA-256, за исключением строго перечисленных входных hooks ленты.
- DAL ленты использовал основной `get_conn()`, который также обслуживает business expiry. Теперь свой `EXTERNAL_FREIGHT_DB_PATH`, SQLite connection и UUID; путь/alias основной БД отклоняется. Нет business schema migration и cross-database joins/FK. Основная БД используется только действующей авторизацией.
- Общий `translate_service` больше не импортируется лентой. Кнопки и клиентского вызова перевода нет; старый endpoint проверяет доступ и отвечает 503 `external_feed_translation_disabled`, скрытая запись — 404. AI не нужен для импорта/просмотра/закладок.
- Общие RootHeader/DatePicker восстановлены из продуктовой базы. В основных feeds добавлена только обёртка с кнопкой, исходный RootHeader сохранён внутри. Календарь и keyboard overlay принадлежат ленте. Удалена недоказанная задержка показа; фильтры используют отдельный native Modal.

## Файлы относительно продуктовой базы

| Файл | Зачем изменён | Влияние на основной продукт |
|---|---|---|
| `.github/workflows/build-android-apk.yml` | QA2 build/deploy, флаг и отдельный backup ленты | Только QA2; public/prod workflows не изменены относительно базы |
| `.github/workflows/qa-staging-deploy.yml` | QA2 build/deploy, флаг и отдельный backup ленты | Только QA2; public/prod workflows не изменены относительно базы |
| `backend/.env.example` | Настройки только внешнего хранилища/импортёра | Нет, отключены по умолчанию |
| `backend/api/external_freight.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/database/external_freight_connection.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/database/external_freight_dal.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/main.py` | Регистрация отдельного router и schema-init только при флаге | Добавочный hook, остальные строки совпадают с базой |
| `backend/services/external_freight_classifier.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/services/external_freight_import_adapter.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/services/external_freight_parser.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/services/external_freight_queue_bridge.py` | Отдельный API, SQLite, детерминированный parser/classifier и durable bridge | Нет изменений основных таблиц/обработчиков; auth используется для чтения UID/роли |
| `backend/tests/auth_harness.py` | Ранее отдельный commit 1f624e65: поддержка lazy FastAPI router в тестах | Только тестовая инфраструктура, runtime не меняется |
| `backend/tests/test_auth_harness.py` | Ранее отдельный commit 1f624e65: поддержка lazy FastAPI router в тестах | Только тестовая инфраструктура, runtime не меняется |
| `backend/tests/test_external_freight_feed.py` | Контракты изоляции, импорта, TTL, прав и закладок | Только синтетические тестовые БД |
| `backend/tests/test_external_freight_parser.py` | Контракты изоляции, импорта, TTL, прав и закладок | Только синтетические тестовые БД |
| `backend/tests/test_external_freight_queue_bridge.py` | Контракты изоляции, импорта, TTL, прав и закладок | Только синтетические тестовые БД |
| `config/qa2-android-build-metadata.js` | Следующий QA2 versionCode 214494467 | Только QA-пакет |
| `docs/qa/external-freight-feed-20261020/bookmarks-continuation-20261021.md` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/bridge-checkpoint-20261021.md` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/bridge-preflight-20261021.md` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/implementation-checkpoint.md` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/scope-isolation-preflight-20261021.md` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/scope-isolation-report-20261021.md` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/urtruck-qa2-feed-bridge.service` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `docs/qa/external-freight-feed-20261020/urtruck-qa2-feed-bridge.timer` | ТЗ, pre-flight, checkpoint, изоляция и инструкции bridge | Нет, документация |
| `scripts/qa/benchmark_external_freight.py` | Изолированный benchmark ленты | Временная отдельная SQLite |
| `src/components/externalFreight/ExternalFeedDatePicker.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `src/components/externalFreight/ExternalFreightEntry.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `src/navigation/AppNavigator.js` | Отдельный stack-маршрут за флагом и ролью | Добавочный маршрут; tabs и остальные маршруты сохранены |
| `src/screens/CargoFeedScreen.js` | Только отдельная кнопка входа вокруг исходной шапки | Да, только согласованный вход; списки/фильтры/обработчики не изменены |
| `src/screens/ExternalFreightFeedScreen.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `src/screens/FeedScreen.js` | Только отдельная кнопка входа вокруг исходной шапки | Да, только согласованный вход; списки/фильтры/обработчики не изменены |
| `src/utils/externalFeedFilterPress.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `src/utils/externalFreightFeed.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `src/utils/externalFreightModel.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `src/utils/externalFreightSession.js` | Экран, локальные компоненты, read-only API/закладки внешней ленты | Нет, отдельное пространство функции |
| `tests/e2e/external-freight-bookmarks.spec.js` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/fixtures/external-freight-protected-baseline.json` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/frontend/test_external_freight_price_keyboard.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/frontend/test_external_freight_scope.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/frontend/test_qa2_live_build_contract.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/frontend/test_qa_staging_deploy_workflow.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/unit/externalFreightBookmarks.test.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/unit/externalFreightModel.test.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |
| `tests/unit/externalFreightSession.test.mjs` | Регрессии UI/навигации, контракт сборки и guard защищённых файлов | Тесты, без пользовательских данных |

Общие `src/components/ui/v1/RootHeader.js` и `src/components/DatePicker.js` не входят в итоговый diff к базе: восстановлены полностью. Предыдущие утверждённые исправления не переносились вручную и сохранены своей историей merge. Изолированное изменение test harness уже находилось в отдельном `1f624e65`.

## Проверки объединённого кода

- 122 backend tests PASS: внешняя лента/parser/bridge, расходы, публикация с повтором и восстановление аккаунта; только синтетическая `/tmp/...primary.db` и отдельные tmp feed DB.
- 85 связанных Node tests PASS со штатным loader; дополнительно 29 guards исходников PASS.
- 6 Playwright UI tests PASS для обеих ролей: после внешних фильтров сохранены значения основных фильтров, нет business writes и AI requests; закладки/повтор/поиск. Это синтетический UI, не QA2 и не физическая приёмка.
- lint 567 активных JS, web export PASS, i18n проверен до merge (повтор будет зафиксирован при окончательном candidate); diff --check PASS.
- Отдельный SQL benchmark: 100000 синтетических записей, 30 запросов, p95 1.97ms / p50 1.68ms на этом Mac. Это DAL, не network/API p95.

## Среды и доказательства

QA2 API `/api/v1/external-freight` последний раз отвечал 404, runtime 1.0.50 от 19.10. Deploy/import не выполнялись: обязательный независимый review PR568 ещё не получен (§6 ENGINEERING_CONSTITUTION). Существующий Telegram publisher, очередь и production не изменялись. Новый кандидат требует физической перепроверки Xiaomi; старые скриншоты 214494466 не доказывают новый код. iPhone недоступен.

## Откат

Выключить feed/import flags, остановить отдельный bridge, выполнить адресный revert патчей ленты. Отдельный SQLite-файл сохраняется; старую основную БД поверх текущей не возвращать. QA2 workflow берёт online backup нового файла, если он уже существует; неперенесённые legacy записи в основной БД блокируют deploy с `QA_EXTERNAL_FEED_LEGACY_MIGRATION_REQUIRED`, без удаления и автоматического изменения.

Статус до физической проверки и QA2 API: PARTIAL. Публичный выпуск не выполняется.
