# AGENTS.md

Этот файл — точка входа для AI-ассистентов (Codex, Claude Code, Cursor и т.п.),
работающих в этом репозитории.

**До любой работы обязательно прочитать:**

1. [`docs/ENGINEERING_CONSTITUTION.md`](docs/ENGINEERING_CONSTITUTION.md) — главный anti-regression протокол;
2. [`docs/GOLDEN_BASELINE.md`](docs/GOLDEN_BASELINE.md) — подтверждённые known-good блоки и текущие регрессии;
3. [`CLAUDE.md`](CLAUDE.md) — архитектура и специальные правила проекта.

Если документы расходятся, фактический проверенный Golden Baseline и более новое
явное решение владельца имеют приоритет. До изменения кода обязателен PRE-FLIGHT.

## Обязательный формат PRE-FLIGHT

Перед каждой проверкой, правкой или deploy в комментарии к задаче и в журнале
проверок зафиксировать:

1. `Branch/SHA` — фактическая ветка и исходный SHA рабочего дерева;
2. `Known-good` — конкретная реализация, SHA, сборка и устройства, на которых
   она доказана; исторический PASS нельзя переносить на новый SHA;
3. `Scope` — затрагиваемые модули и явно защищаемые модули/окружения;
4. `Checks` — связанные автоматические, серверные и физические проверки;
5. `Rollback` — точный план восстановления кода, настроек и данных.

PASS действует только для указанного SHA, конкретной сборки и конкретных
устройств. Для другого SHA, сборки или устройства требуется новое доказательство.

**Основной архитектурный источник — [`CLAUDE.md`](CLAUDE.md).** Прочитать его
целиком перед началом работы: архитектура фронтенда/бэкенда, правила UI,
Graphify-gated changes (обязательный процесс перед правками навигации,
FeedScreen/MyTripsScreen, i18n, backend registration, chat/deal room,
attachments, database logic), режимы MOCK/REAL и т.д. Всё, что написано там,
действует независимо от того, каким инструментом ведётся работа, кроме явно
устаревшей секции CLAUDE.md про временное отключение Android background
location — актуальный канон ниже имеет приоритет.

## Актуальный канон Android GPS — проверять перед любой правкой геолокации

### Фоновая геолокация Android включена для активного рейса

Источник истины для release-flow:
`docs/release/google-play-background-location.md`.

Текущая архитектура UrTruck использует `expo-location` background task для
GPS-контроля активного многодневного рейса. Поэтому Android-сборка должна
сохранять согласованно:

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`;
- `ACCESS_BACKGROUND_LOCATION`;
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`;
- `isAndroidForegroundServiceEnabled: true`;
- `isAndroidBackgroundLocationEnabled: true`.

Permission-flow запускается **только** после явного действия водителя
**«Начать рейс»** внутри принятой сделки. До Android runtime permission
обязательно показывается prominent disclosure UrTruck, который объясняет
collection, sharing, background use и stop condition. После foreground grant
Android запрашивается background location / «Разрешить всегда». Сделка не
может перейти `accepted → in_progress`, пока permission-flow не завершился
успешно.

Все входы в принятую сделку обязаны использовать
`src/components/deal/DealWorkspaceRoute.js`, который монтирует
`DealLocationPermissionGate → DealWorkspaceScreenV2`. Нельзя импортировать
`DealWorkspaceScreenV2` напрямую из другого screen-файла: это снова создаст
`disclosure_host_unavailable` при Start trip.

Background hook не имеет права самостоятельно показывать permission prompt.
Tracking должен останавливаться после завершения/отмены рейса и не должен
обещать автоматическую работу после force-stop/termination процесса.

**Google Play:** сборку с `ACCESS_BACKGROUND_LOCATION` нельзя считать готовой
к публикации, пока Background location declaration, FGS location declaration,
privacy policy, store listing и актуальное Android demo-video не соответствуют
фактическому AAB. Перед каждым release повторно сверять официальную политику
Google Play и checklist из `docs/release/google-play-background-location.md`.
