# UrTruck Maestro QA harness

Smoke-флоу для проверки UrTruck в iOS Simulator под Expo Go,
на стабильных `testID` / `accessibilityLabel`.

Подробная стратегия безопасной QA-аутентификации — см.
[`docs/QA_AUTH_STRATEGY.md`](../../docs/QA_AUTH_STRATEGY.md).

## Требования

- Maestro >= 2.6.0 (`maestro --version`)
- Xcode + iOS Simulator (booted)
- Expo Go установлен в симуляторе (ставится автоматически при `npx expo start --ios`)
- Metro поднят: из корня проекта — `npx expo start`, проект хоть раз открыт в Expo Go, чтобы запись попала в Recently Opened
- `host.exp.Exponent` — `appId` для всех флоу

## Запуск

```bash
# подготовка
npx expo start --ios

# из qa/maestro/screenshots/ — чтобы PNG'и легли сюда же
cd qa/maestro/screenshots

# канонический release-smoke
xcrun simctl terminate booted host.exp.Exponent
maestro test ../smoke-suite.yaml

# отдельные роли с локальной QA-аутентификацией
xcrun simctl terminate booted host.exp.Exponent && maestro test ../driver-auth.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../client-auth.yaml
```

## QA Auth Path (authenticated flows)

Глубокие flows (`driver-auth.yaml`, `client-auth.yaml`,
`verification-authenticated.yaml`, `createcargo-authenticated.yaml`)
требуют залогиненной сессии. OTP/SMS обходим через **существующий**
backend-endpoint `POST /api/v1/qa/ensure-actor` + крошечный
dev-only хук в `OnboardingV2Screen` (виден только при `__DEV__` и
не в `standalone`-сборке). Шаги:

```bash
# 1. Поднять локальный backend
cd backend
export URTRUCK_ENV=development
export QA_AGENT_TOKEN="$(openssl rand -hex 32)"
export WHATSAPP_ACCESS_TOKEN=""                  # MOCK провайдер
DB_PATH="$PWD/database/security.db" \
  STORAGE_LOCAL_ROOT="$PWD/storage" \
  STORAGE_LOCAL_PUBLIC_BASE="/storage" \
  python -m uvicorn main:app --host 0.0.0.0 --port 8001 &
cd ..

# 2. Прокинуть env в Maestro (префикс MAESTRO_*, всё остальное игнорируется)
export MAESTRO_QA_AGENT_TOKEN="$QA_AGENT_TOKEN"
export MAESTRO_BACKEND_BASE="http://127.0.0.1:8001/api/v1"

# 3. Старт Expo (если ещё не)
npx expo start --ios

# 4. Прогон authenticated flows
cd qa/maestro/screenshots
xcrun simctl terminate booted host.exp.Exponent && maestro test ../driver-auth.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../client-auth.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../verification-authenticated.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../createcargo-authenticated.yaml
```

`MAESTRO_BACKEND_BASE` указывающий на `urtruck.kz` / `185.22.65.11` /
`prod*` — отклоняется без `MAESTRO_ALLOW_REMOTE=1`. Для shell-обёртки
`_lib/ensure-actor.sh` — `QA_ALLOW_REMOTE_BACKEND=1` соответственно.

В **production-сборке** (`__DEV__ === false` или
`Constants.appOwnership === 'standalone'`) хук `qa-debug-submit` не
рендерится — то есть даже если кто-то знает `QA_AGENT_TOKEN`, через
живое приложение залогиниться по этому пути нельзя.

## Состав

| Файл | Селекторы | Статус |
| --- | --- | --- |
| `smoke-suite.yaml` | актуальные guest-навигация, Border/CGR и onboarding/verification render | release entry |
| `driver-auth.yaml` | actor=serik → четыре вкладки Feed/MyWork/Deals/Queue, профиль через `feed-menu-btn`, Border/CGR | требует локального backend |
| `client-auth.yaml` | actor=boris → четыре вкладки MyWork/Feed/Deals/Queue; CreateCargo через `mytrips-place-cargo` | требует локального backend |
| `verification-authenticated.yaml` | профиль через общий `_lib/open-profile.yaml` → My status → Identity/PRO | требует локального backend |
| `createcargo-authenticated.yaml` | MyWork → `mytrips-place-cargo` → форма CreateCargo; submit не выполняется | требует локального backend |
| `driver-4tabs.yaml` / `client-4tabs.yaml` | канонические четыре вкладки без Chats/Profile/Publish | release smoke |
| `driver-queue-cgr.yaml` | role-aware Border/CGR и свёрнутый manual lookup | release smoke |
| `verification-render.yaml` | onboarding/auth render и стабильные Identity testID | release smoke |

Все assert и tap идут через `id:` (XCUITest accessibility identifier).
Текстовый fallback оставлен только там, где элемент рисуется самим Expo Go
(«Continue», «Reload», «Смотреть грузы» — onboarding до загрузки бандла).

## Каталог стабильных селекторов

Селекторы, уже зашитые в исходники UrTruck:

### Onboarding V2 (`src/screens/onboarding/OnboardingV2Screen.js`)
- `onb-v2-cta-phone` — «Продолжить по номеру»
- `onb-v2-cta-guest` — «Смотреть грузы»

### Phone Auth V2 (`src/screens/onboarding/PhoneV2Screen.js`)
- `phone-v2-country-btn` — селектор страны (флаг +7)
- `phone-v2-input` — ввод телефона
- `phone-v2-cta` — кнопка «Продолжить»

### BottomNav (`src/components/ui/v1/BottomNav.js`)
- `bottom-nav` — контейнер
- `bottom-nav-feed` / `bottom-nav-mywork` / `bottom-nav-deals` / `bottom-nav-queue`
- `bottom-nav-deals-badge` — счётчик внимания на «Сделках»
- Profile не является вкладкой: `feed-menu-btn`, `mywork-menu-btn`, `deals-menu-btn`
- публикация живёт внутри MyWork: `mytrips-publish-route` / `mytrips-place-cargo`

### ProfileScreen (`src/screens/ProfileScreen.js`) — *обновлено в этой ветке*
- `profile-my-status` — карточка «Мой статус» (driver-only)
- `profile-my-reviews` — карточка «Мои отзывы»
- `profile-pro-cta` — кнопка «Получить статус PRO»
- `profile-push-filter` — кнопка «Push-фильтр» / `accessibilityLabel="Push-фильтр"`
- `profile-change-role` — DEV-only переключатель роли
- `profile-logout` — выход

### QueueScreenLazyV2 (`src/screens/QueueScreenLazyV2.js`)
- `border-screen-v2` — канонический экран Border/CGR
- `border-driver-vehicle-card` — контекст машины водителя
- `border-driver-manual-toggle` — явное раскрытие ручного поиска

### DealsScreen (`src/screens/DealsScreen.js`)
- `deal-room-list` / `deals-list` — контейнер канонических «Сделок»
- `deals-minimal-header` / `deals-menu-btn` — шапка и вход в профиль
- `deals-tab-offers|active|archive` — актуальные сегменты
- `deals-driver-bid` / `deals-deal-card` — предложение и сделка
- `deal-room-search` — поиск

### Identity Step (`src/screens/registration/IdentityStepScreen.js`)
- `identity-step-screen` (контейнер)
- `identity-first-name`, `identity-last-name`, `identity-birth`, `identity-iin`
- `identity-photo`, `identity-back`, `identity-close`, `identity-help`, `identity-next`

### Create flows
- CreateCargo: `cargo-from-input`, `cargo-to-input`, `cargo-desc-input`, `cargo-weight-field`, `cargo-volume-field`, `cargo-submit-button`
- CreateTrip: `trip-from-input`, `trip-to-input`, `trip-truck-*`, `trip-weight-field`, `trip-volume-field`, `trip-payment-{negotiable,fixed}`, `trip-price-input`, `trip-currency-*`, `trip-submit-button`

## Что не покрыто (Expo Go SDK 52 ограничения)

- **OTP-флоу.** Симулятор не получает SMS — registration после `phone-v2-cta` недоступна.
- **Production-аутентификация.** Guest-smoke не заменяет actor-flow: обе роли имеют четыре вкладки, а QA actor-login доступен только в dev/Expo Go.
- `expo-notifications` push в Expo Go SDK 52 урезан.
- Камера/галерея/реальные фото документов и OCR — на симуляторе ограничено.
- `urtruck://` deeplink (Expo Go использует только `exp://`).
- TestFlight build / реальные Apple permissions / push / Apple App Updates — на реальном устройстве.

## Известная особенность Maestro + RN New Architecture

В Expo Go (Bridgeless) Maestro/XCUITest часто не индексирует мелкие
`<Text>` внутри карточек по тексту. Поэтому *все* assert и tap в этих
флоу переведены на `id:`-селекторы. Текстовый fallback оставлен только для
самой первой стадии (онбординг до загрузки бандла + dev-menu Expo Go),
где testID-ы недоступны.
