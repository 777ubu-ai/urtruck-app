# UrTruck — актуальный инженерный канон

> Дополняет `CLAUDE.md`'s "Архитектура backend"/"Архитектура фронтенда" там,
> где код разошёлся с текстом. Составлено 2026-09-08, Track B инженерного
> спринта. Основано на прямой проверке (grep, чтение файлов, синтакс-чек
> через babel, запуск тестов) — не на пересказе.

## 1. Backend роутеры — фактически 23, не 18

`CLAUDE.md` утверждает 18 роутеров. Подтверждено прямым подсчётом:
```
grep -c "app.include_router" backend/main.py   →  23
```
Дополнительно: `backend/api/borders_lazy.py` не монтируется отдельным
`include_router` — сливается в `borders_router` вручную через
`api/__init__.py` (`.routes[0:0] = ...`), обход стандартного механизма
FastAPI. Покрыто тестом `backend/tests/test_borders_lazy_routes.py` — не
трогать без прогона этого теста.

## 2. Theme-токены — единый источник для `warning`

До Track B: `designV1.js` (`LIGHT.warning='#B76B00'`, 0 живых потребителей),
`brandV2.js` (`warning='#FF8400'`, легитимно другая роль — фон/плашка, не
текст), `qa/utils/themeContrastSmoke.js` (собственная копия,
`LIGHT.warning='#F59E0B'`, разошедшаяся с источником), и 6+ экранов с
хардкодом `#E06D00` напрямую.

После Track B (первый проход, коммит `fix(theme): consolidate warning
token...`):
- `src/theme/designV1Palette.js` — чистые данные (`LIGHT`/`DARK`, без
  импортов), единственный источник для `designV1.js`'s токенов.
  `designV1.js` реэкспортирует их и добавляет только `useV1Colors()`.
- `qa/utils/themeContrastSmoke.js` импортирует РЕАЛЬНЫЕ палитры
  (`designV1Palette.js` + `brandV2.js`) вместо копии — расхождение больше
  невозможно физически, не только по соглашению.
- Это впервые проверило 4 связки цвет/фон, которые раньше не проверялись
  вообще или проверялись с другим, одинаково неверным числом —
  `npm run qa:theme-contrast` честно упал (код 1), задокументировано как
  known-failure с решением владельца.

**Владелец решил (2026-09-08): сохранить визуальный стиль, не убирать
яркие акцентные цвета — только развести "текст" и "фон/иконка/декор" на
разные токены там, где один hex обслуживал обе роли.** Второй коммит
(`fix(theme): text/non-text token split for WCAG AA`) это реализовал —
**`npm run qa:theme-contrast` сейчас снова exit 0**, 0 FAIL:

| Токен | Роль | LIGHT hex | Контраст (реальный фон) | Порог |
|---|---|---|---|---|
| `designV1.warning` | только текст (нет фон/icon-использования) | `#E06D00` → `#B45800` | 4.84:1 на `#FFFFFF` | 4.5:1 |
| `brandV2.error` | фон/бордер (не менялся) | `#EF4444` | 3.76:1 на `bg`, 3.39:1 на `surfaceMuted` | 3:1 |
| `brandV2.errorText` (новый) | текст (registration/onboarding, 4 живых файла) | `#D03B3B` | 4.80:1 на `#FFFFFF` | 4.5:1 |
| `brandV2.info` | фон/бордер (не менялся) | `#3478D4` | 4.39:1 на `bg` | 3:1 |
| `brandV2.infoText` (новый) | текст (0 живых потребителей — forward guard) | `#3273CC` | 4.71:1 на `#FFFFFF` | 4.5:1 |
| `brandV2.accent` | фон/бейдж/лого/маршрут (не менялся) | `#FF8400` | не тестируется — нет UI-компонент/icon-использования | — |
| `brandV2.accentIcon` (новый) | иконка (`RoleScreen.js:151`) | `#FF8400` → `#D26D00` | 3.19:1 на реальном `surfaceMuted` | 3:1 |

DARK-варианты не менялись — уже проходили (6.5-8.75:1) во всех связках.
Затронутые живые файлы (только текстовые usage, border/background не
трогались): `src/screens/registration/IdentityStepScreen.js`,
`src/components/DateOfBirthSheet.js`, `src/screens/onboarding/OtpV2Screen.js`,
`src/screens/onboarding/PhoneV2Screen.js`, `src/components/RegistrationCloseModal.js`,
`src/screens/RoleScreen.js`. `src/screens/registration/SelfieStepScreen.js`
(мёртвый файл, см. п.4.1) содержит идентичный `color: brand.error` —
сознательно не тронут, чтобы не расширять диф на неиспользуемый код.

## 3. i18n — загрузчик защищён от сбоя вне бандла

`src/utils/i18n.js` раньше статически импортировал `storage` и
`{ Platform, NativeModules }` из `react-native` на уровне модуля, плюс
top-level `(async () => {...})()` без `try/catch`, вызывающий
`storage.get/set`. Последствия: (а) файл нельзя было импортировать из
голого Node-тулинга (react-native ломается вне Metro), (б) любой реальный
сбой внутри `storage.js` на любой платформе давал unhandled promise
rejection без отката.

Исправлено: ленивые `require()` (тот же паттерн, что уже был у
`getLocalization()` в этом же файле), IIFE обёрнут в `try/catch`. Поведения
приложения не меняет — `translations`, `t()`, `setLanguage()` работают
как раньше (кроме `t()`'s fallback-цепочки, которая **осталась прежней**
намеренно — см. `docs/CURRENT_PRODUCT_CANON.md`, п.5, и не путать с
ретрагированной находкой предыдущего аудита).

## 4. Manifest мёртвого/осиротевшего кода (только список — ничего не удалено)

Правило: не удалять, пока не доказано 0 импортов / 0 навигационных ссылок /
0 тестов / 0 уникальной бизнес-логики (см. `CLAUDE.md`). Ниже — подтверждено
прямым `grep` по всему `src/` + `App.js` в рамках Track B; удаление —
отдельное решение владельца, отдельный коммит.

### 4.1. Подтверждено мёртвым (0 живых импортов)
- `src/screens/ChatScreen.js` (2814 строк) — тесты, которые его читали,
  перенесены на `DealWorkspaceScreenV2.js`/`dealActionResolver.js` (Track B / B1).
- `src/screens/DealWorkspaceScreen.js` (1993 строки, V1)
- `src/screens/QueueScreenCarousel.js` (859 строк)
- `src/screens/QueueScreenLazy.js` (564 строки)
- `src/screens/registration/SelfieStepScreen.js`, `VehiclePhotosScreen.js`
  — уже задокументированы как неподключённые прямо в `AppNavigator.js:288`
- `src/components/verification/*` (9 файлов, 643 строки) — изолированный
  кластер, ссылается только сам на себя; обслуживал только два файла выше
- `src/components/PressableScale.js`, `src/components/ui/AppShell.js`,
  `src/components/ui/SectionCard.js`

### 4.2. Ранее ошибочно причислены к мёртвым — ОПРОВЕРГНУТО в Track B
Предыдущий архитектурный аудит грепал только `src/`, пропустив корневой
`App.js`:
- `src/components/ErrorBoundary.js` — **живой**, `App.js:328`
- `src/components/OfflineBanner.js` — **живой**, `App.js:311`
- `src/components/PushPermissionBanner.js` — **живой**, `App.js:312`
- `src/components/ShimmerButton.js` — не перепроверялся отдельно в Track B,
  рекомендуется повторный grep с учётом `App.js` перед удалением

### 4.3. Осиротевший маршрут (не мёртвый код, но недостижим)
- `TrackTruckScreen.js` + маршрут `'TrackTruck'` — см.
  `docs/CURRENT_PRODUCT_CANON.md`, п.2.2.

## 5. Параллельные COPY-словари (инвентарь, не мигрировано — B5)

Экраны с собственным `const COPY/TEXT/LABELS = { RU: {...}, EN: {...}, ZH: {...}, KK: {...} }`
в обход центрального `src/utils/i18n.js`. Все проверены на реальную
монтированность в `AppNavigator.js`:

| Файл | Смонтирован? |
|---|---|
| `src/screens/FeedScreen.js` | Да — вкладка Feed (client) |
| `src/screens/CargoFeedScreen.js` | Да — вкладка Feed (driver) |
| `src/screens/DealsScreen.js` | Да — вкладка Deals (обе роли) |
| `src/screens/DealWorkspaceScreenV2.js` | Да — единственный экран сделки |
| `src/screens/QueueScreenLazyV2.js` | Да — вкладка Queue (реэкспорт из `QueueScreen.js`) |
| `src/screens/registration/PremiumProfileScreen.js` | Да — `RegProfile` route |
| `src/screens/onboarding/ProfileV2Screen.js` | Да — `ProfileV2` route |
| `src/screens/DealWorkspaceScreen.js` | **Нет** (см. 4.1, мёртвый V1) |
| `src/screens/QueueScreenCarousel.js` | **Нет** (см. 4.1, мёртвый) |
| `src/screens/QueueScreenLazy.js` | **Нет** (см. 4.1, мёртвый) |

7 из 10 файлов с локальными COPY-словарями — живые, реально показываются
пользователю. Внутри каждого проверенного (`FeedScreen`, `DealsScreen`) все
4 языка присутствуют симметрично — рассинхрона внутри самих словарей не
найдено. Риск в другом: два независимых механизма перевода в одном
проекте усложняют будущий аудит (проверка симметрии в `i18n.js` их не
видит). Консолидация в центральный `i18n.js` — отдельная задача, крупная
миграция, сознательно не делается в рамках одного коммита (см. правило
1.5 инженерного спринта).

## 6. Тестовая инфраструктура для Node-скриптов

`node --test tests/frontend/<file>` требует относительных импортов с
явным `.js`-расширением — Metro/webpack резолвят и без него, голый Node
ESM — нет. За Track B это исправлено точечно в файлах, которые сессия уже
трогала (`src/utils/dealActionResolver.js`, `src/utils/i18n.js`). Если
другой Node-тулинг падает с `ERR_MODULE_NOT_FOUND` на относительном
импорте без расширения — это тот же класс проблемы, не новый баг.
