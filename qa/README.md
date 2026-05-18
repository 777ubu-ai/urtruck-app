# QA Tools — quick reference

3 уровня проверки UrTruck. Запускать **локально** (Mac) — у меня в
sandbox Playwright chromium недокачивается, статика прогоняется
автоматически.

## Tier 1 — Статика (5 секунд)

```bash
npm run qa:i18n      # все t() ключи существуют в RU/EN/KK/ZH
npm run qa:ux        # UX-паттерны (например, RoleScreen не вернулся в dark)
npm run qa:theme     # цветовая палитра
npm run qa:geo       # gegrap-парсер маршрутов
node qa/agents/no-uzbek.spec.js   # нет UZ-следов в коде
```

Что проверяет: синтаксис, i18n, дизайн-паттерны.
Что не проверяет: реальные клики, network, рендер.

## Tier 2 — Backend Chat API smoke (30 секунд)

```bash
# Public-режим (без auth)
node qa/utils/chatSmoke.js

# Authenticated (нужен URTRUCK_TOKEN из браузера)
URTRUCK_TOKEN=<token> node qa/utils/chatSmoke.js

# Против локального backend
URTRUCK_API=http://localhost:8001/api/v1 URTRUCK_TOKEN=<token> node qa/utils/chatSmoke.js
```

**Где взять `URTRUCK_TOKEN`:**
1. Открой `urtruck.kz` в iPhone Safari или web
2. Пройди регистрацию (Phone → OTP)
3. После входа: Safari DevTools → Application → Local Storage → key `ur_reg_token`
4. Скопируй значение → передай в env var

Что проверяет:
- `/chat/translate/info` — провайдер OpenAI настроен
- `/chat/contacts` — support-bot существует
- `/chat/unread` — endpoint работает
- `/chat/rooms` — список комнат
- `/chat/send` → support — отправка сообщения
- `/chat/messages/<room>` — приходит ли отправленное
- `/chat/translate` — переводится ли через OpenAI

Маркер `[ar-chatSmoke-<ts>]` в тексте → Auditor отсеет qa-сообщения
из dirty_bids_report.

## Tier 3 — Playwright E2E (5 минут)

Реальные клики в headless chrome против `urtruck.kz`.

```bash
# 1. Поставить chromium binary (раз)
npx playwright install chromium

# 2. Полный mobile-прогон
npm run qa:mobile

# 3. Один spec
npx playwright test --config qa/playwright.mobile.config.js qa/mobile/onboarding.mobile.spec.js

# 4. Против локального dev-сервера (npm run web сначала)
QA_BASE_URL=http://localhost:8081 npm run qa:mobile
```

Существующие spec'и в `qa/mobile/`:
- `_helpers.js` — общие утилиты
- `role.tap.spec.js` — RoleScreen real-tap regression guard
- `role.layout.spec.js` — RoleScreen DOM/bbox
- `navigation.mobile.spec.js` — bottom-nav доступность
- `forms.mobile.spec.js` — create-trip / create-cargo формы
- `driver.mobile.spec.js` — driver flow
- `shipper.mobile.spec.js` — shipper flow
- `theme.mobile.spec.js` — цвета по теме
- **`onboarding.mobile.spec.js`** ← новый, проверяет:
  - OnboardingV2 загружается с обеими CTA видимыми
  - "Продолжить по номеру" real-tap → PhoneV2
  - "Смотреть грузы" real-tap → Main(guest)
  - Свайп между слайдами 1→2→3, paginator обновляется

Что проверяет: реальные клики, swipe, navigation, ErrorBoundary.

## Tier 4 — Production observability (TODO)

См. `docs/observability/SENTRY_PLAN.md`. **Не подключено** — требует
добавление `@sentry/react-native` в `package.json` (запрещено
owner-инструкцией без явного OK).

## Когда что запускать

| Случай | Что прогнать |
|---|---|
| Каждый PR | Tier 1 (статика) — обязательно |
| PR трогает chat / translate | Tier 1 + Tier 2 chatSmoke |
| PR трогает UI / onboarding / role / нав. | Tier 1 + Tier 3 Playwright |
| Перед deploy в production | Все три уровня |
| После deploy | curl bundle hash + Tier 3 на проде |

## Где результаты

Tier 1, 2: stdout + exit code (0 = OK, 1 = failed)
Tier 3 (Playwright):
- `qa/reports/` — JSON по каждому actor'у
- `qa/screenshots/` — снимки при failure
- `playwright-report/` — html report

## Известные ограничения

- **Из sandbox (мой режим)** — Playwright chromium недокачивается
  (CDN заблокирован egress'ом). Прогон только локально на Mac.
- **Без `URTRUCK_TOKEN`** chatSmoke прогоняет только public-часть
  (translate/info, contacts).
- **TestFlight native** — НИЧЕМ из этого не проверяется. Только
  ручной тест на iPhone + Sentry (когда подключим).
