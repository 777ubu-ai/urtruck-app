# UrTruck Maestro QA harness

Smoke-флоу для проверки UrTruck в iOS Simulator под Expo Go,
на стабильных `testID` / `accessibilityLabel`.

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

## Состав

| Файл | Селекторы | Статус |
| --- | --- | --- |
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
