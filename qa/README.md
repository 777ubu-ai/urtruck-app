# UrTruck QA Center

Единая точка входа для автоматической проверки UrTruck.

## Уровни проверки

1. **Static / unit / regression** — backend pytest, frontend ownership tests, i18n, UX, currency and production build.
2. **Web / PWA E2E** — Playwright against a local build or an explicitly selected remote environment.
3. **Mobile UI E2E** — Maestro on iOS Simulator / Android Emulator using stable `testID` selectors.
4. **Real-device release smoke** — foreground/background/killed push, camera, permissions and deep links on physical iPhone and Android devices.

## Быстрый запуск

```bash
npm ci
npm run qa:center:quick
```

Полный web-набор:

```bash
npx playwright install --with-deps chromium
npm run qa:center:web
```

Maestro-набор (нужен booted simulator/emulator):

```bash
npm run qa:center:maestro:smoke
```

## Каталоги

- `qa/agents/` — Playwright actor and business-flow tests.
- `qa/mobile/` — mobile viewport Playwright checks.
- `qa/maestro/` — native iOS/Android UI flows.
- `qa/utils/` — setup, cleanup, reporting and smoke utilities.
- `qa/artifacts/` — local output; CI uploads reports, traces, screenshots and videos as GitHub artifacts.

## Release gates

Production deployment is allowed only after:

- PR Quality Gate is green;
- QA Center quick gate is green;
- production backup succeeds;
- deploy health check confirms the exact commit via `/build-info.json`;
- real-device smoke is completed for push-sensitive releases.

## Maestro policy

Maestro flows must use `id:` selectors. Text selectors are permitted only for Expo Go system UI where application `testID` values are unavailable. Every critical user action must have a stable `testID` in the application source.

Current Maestro documentation and flow map:

- `qa/maestro/README.md`
- `qa/maestro/MAESTRO_MAP.md`

## Environments

Remote or production-mutating tests are disabled by default. They require explicit environment flags and dedicated QA users. Never place credentials in flow files, reports or screenshots; use GitHub Secrets or local environment variables.
