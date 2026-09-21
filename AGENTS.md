# UrTruck Mandatory Engineering Entry Point

> **STOP RULE:** перед изменением кода, конфигурации, БД, workflow, UI или production
> каждый человек и AI-агент обязан выполнить этот протокол. Новая задача не даёт
> права переписывать уже работающий модуль.

## Обязательное чтение перед любой работой

1. Прочитать этот `AGENTS.md`.
2. Прочитать `docs/ENGINEERING_STANDARDS_AND_QUALITY_PROTOCOL.md`.
3. Прочитать `docs/GOLDEN_BASELINE.md` и найти затрагиваемые подсистемы.
4. Прочитать актуальные `docs/CURRENT_PRODUCT_CANON.md` и
   `docs/CURRENT_ENGINEERING_CANON.md`.
5. Для GPS/Android дополнительно читать
   `docs/release/google-play-background-location.md`.
6. Проверить текущие branch, HEAD SHA, base SHA, незакоммиченные изменения и
   открытые PR, которые пересекаются с задачей.

## PRE-FLIGHT обязателен до первой правки

Зафиксировать в рабочем отчёте:

```text
Task:
Branch:
HEAD SHA:
Base SHA:
Current production/baseline SHA:
Affected modules:
Protected modules that must remain unchanged:
Existing known-good implementation / commit / PR:
Regression risks:
Tests that already protect this area:
Tests to add/update:
Minimal-change plan:
Rollback plan:
```

Если неизвестно, где последняя рабочая реализация, **сначала искать её в Git
history/branches/PR**, а не писать замену с нуля.

## Anti-regression rules

- **NO REWRITE:** нельзя переписывать рабочий Chat/Deal/FSM/Push/GPS/Map/Auth/
  Documents/Voice/Translation/Payments без отдельного доказанного решения.
- **MINIMAL DIFF:** одна задача — один логический scope. Попутный рефакторинг
  запрещён.
- **ROOT CAUSE:** исправление P0/P1/P2 обязано включать причину и regression test.
- **NO FALSE DONE:** build, HTTP 200, локальный запуск или эмулятор не означают
  production-ready.
- **NO FALSE 10/10:** статус 10/10 разрешён только при доказательствах,
  перечисленных в Golden Baseline и release criteria.
- **STOP THE LINE:** если новая правка ломает ранее подтверждённый сценарий,
  дальнейшая разработка останавливается до rollback/fix и повторной регрессии.
- **BASELINE IS EVIDENCE:** `GOLDEN_BASELINE.md` обновляется только точными SHA,
  CI run IDs, устройствами, production evidence и результатами тестов.

## Обязательные проверки перед PR/merge

Минимум использовать существующие канонические gates проекта:

- `PR Quality Gate`;
- `UrTruck QA Center`;
- `UrTruck Full QA Audit`;
- `UrTruck Governance Guard`.

Падение любого required check = **MERGE BLOCKED**.

Для UI обязательны before/after screenshots. Для mobile/GPS/push/voice/map
финальная приёмка требует физического устройства по критериям задачи.

---

# Repository-specific rules already in force

Этот файл — точка входа для AI-ассистентов (Codex, Claude Code, Cursor и т.п.),
работающих в этом репозитории.

**Основной источник инструкций — [`CLAUDE.md`](CLAUDE.md).** Прочитать его
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
