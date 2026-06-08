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

# между прогонами Expo Go надо терминировать
xcrun simctl terminate booted host.exp.Exponent && maestro test ../driver-tabs.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../client-tabs.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../profile-queue-chats.yaml
xcrun simctl terminate booted host.exp.Exponent && maestro test ../verification-render.yaml
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
| `driver-auth.yaml` | runScript `_lib/ensure-actor.js` (actor=serik) → `qa-debug-token`/`qa-debug-submit` → driver Main + 5 табов, Profile→`profile-my-status`, Queue→`queue-title`, Chats→`deal-room-list` | требует локального backend |
| `client-auth.yaml` | actor=boris → клиентский tab-bar (Publish видим, Queue/Chats скрыты), `cargo-from-input` после `bottom-nav-publish` | требует локального backend |
| `verification-authenticated.yaml` | actor=serik → Profile → My status → опционально `profile-pro-cta` → Identity (`identity-first-name`, `identity-iin`, `identity-help`) | требует локального backend |
| `createcargo-authenticated.yaml` | actor=boris → `bottom-nav-publish` → форма CreateCargo (`cargo-from/to/desc/weight/volume/submit`). Submit НЕ нажимается, чтобы не плодить QA-записи. | требует локального backend |
| `driver-tabs.yaml` | `onb-v2-cta-guest`, `bottom-nav-{feed,mywork,queue,chats,profile}` | ✅ PASS |
| `client-tabs.yaml` | `onb-v2-cta-{phone,guest}`, `bottom-nav-{feed,profile}` | ✅ PASS (полный client-tab-bar — NOT PROVEN без OTP) |
| `profile-queue-chats.yaml` | `profile-push-filter`, `profile-my-status`, `profile-pro-cta`, `queue-title`, `queue-cgr-link`, `deal-room-list`, `chats-header`, `deal-room-search` + `assertNotVisible "Обновить приложение"` | ✅ PASS |
| `verification-render.yaml` | `onb-v2-cta-phone`, `phone-v2-input`, `phone-v2-cta`. Опциональная ветка `identity-step-screen` → `identity-first-name`, `identity-last-name`, `identity-birth`, `identity-iin`, `identity-help` | ✅ PASS до Auth, Identity-step — NOT PROVEN без реального OTP |

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
- `bottom-nav-feed` / `bottom-nav-mywork` / `bottom-nav-queue` / `bottom-nav-chats` / `bottom-nav-profile`
- `bottom-nav-publish` (клиентский Publish-таб)
- `bottom-nav-chats-badge` — счётчик непрочитанных

### ProfileScreen (`src/screens/ProfileScreen.js`) — *обновлено в этой ветке*
- `profile-my-status` — карточка «Мой статус» (driver-only)
- `profile-my-reviews` — карточка «Мои отзывы»
- `profile-pro-cta` — кнопка «Получить статус PRO»
- `profile-push-filter` — кнопка «Push-фильтр» / `accessibilityLabel="Push-фильтр"`
- `profile-change-role` — DEV-only переключатель роли
- `profile-logout` — выход

### QueueScreen (`src/screens/QueueScreen.js`) — *обновлено в этой ветке*
- `queue-title` — заголовок «Очереди на границах»
- `queue-gate` — экран ожидания верификации
- `queue-gate-cta` — кнопка «Заполнить документы»
- `queue-cgr-link` / `queue-cgr-link-approved` — переход в CargoRuqsatInfo

### ChatsListScreen (`src/screens/ChatsListScreen.js`) — *обновлено в этой ветке*
- `deal-room-list` — контейнер списка чатов
- `chats-header` — заголовок «Сделки»
- `deal-room-search` — поиск
- `deal-room-filter-all|unread|active|archive` — чипы фильтра
- `deal-room-list-card` / `deal-room-list-unread` — элементы списка

### Identity Step (`src/screens/registration/IdentityStepScreen.js`)
- `identity-step-screen` (контейнер)
- `identity-first-name`, `identity-last-name`, `identity-birth`, `identity-iin`
- `identity-photo`, `identity-back`, `identity-close`, `identity-help`, `identity-next`

### Create flows
- CreateCargo: `cargo-from-input`, `cargo-to-input`, `cargo-desc-input`, `cargo-weight-field`, `cargo-volume-field`, `cargo-submit-button`
- CreateTrip: `trip-from-input`, `trip-to-input`, `trip-truck-*`, `trip-weight-field`, `trip-volume-field`, `trip-payment-{negotiable,fixed}`, `trip-price-input`, `trip-currency-*`, `trip-submit-button`

## Что не покрыто (Expo Go SDK 52 ограничения)

- **OTP-флоу.** Симулятор не получает SMS — registration после `phone-v2-cta` недоступна.
- **Клиентский tab-bar.** Гостевой режим даёт driver-табы; client-табы (Машины / Грузы / Разместить / Профиль) — только после OTP + явного role-switch в Profile.
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
