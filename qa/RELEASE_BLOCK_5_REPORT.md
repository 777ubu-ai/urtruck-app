# UrTruck Release Block 5 Report

Дата: 2026-09-05. Ветка: `arch/urtruck-foundation-v2-0001`.

## Revisions

- Baseline: `90cef81f0e68d2e80d408cc240512b7701b40cc6`.
- Final HEAD: фиксируется commit этого отчёта.
- `DEALS_V2_ENABLED`: production default не менялся, `false`.
- Merge в `main`, deploy, TestFlight/Play publication не выполнялись.

## Backend and Foundation

- Canonical `pytest backend/tests`: **431 passed, 0 failed, 0 skipped, 0 xfailed**, 218 warnings, 15.87 s.
- Foundation V2 после canonical initialization: **17 passed, 0 failed**.
- Security/IDOR/push: **49 passed, 0 failed**.
- FSM/country/expiry: **47 passed, 0 failed**.

## Frontend and static gates

- Frontend unit suite: **375 passed, 0 failed, 0 skipped**.
- `npm run lint`: **PASS**, 220 production JavaScript files parsed.
- `npm run typecheck`: **PASS** как JS static-check equivalent; TypeScript sources/`tsconfig.json` отсутствуют.
- `npm run build:web`: **PASS**.
- `npm ci --ignore-scripts --no-audit --no-fund`: **PASS**.
- `npm audit --omit=dev --audit-level=high`: **1 critical, 11 high, 24 moderate, 0 low** после совместимого audit fix. Remaining high/critical advisories принадлежат Expo 52/RN 0.76 toolchain; npm предлагает Expo 57/RN 0.86 major upgrades. Blind `--force` не выполнялся.

## Playwright

- Mobile browser emulation: **36 passed, 0 failed**.
- Desktop canonical result после повторного запуска: **9 passed, 47 failed, 7 skipped, 7 did not run** из 70, 14.7 min; suite запускается с `E2E_BASE_URL=http://127.0.0.1:4173`.
- Предыдущий desktop root cause подтверждён: статический `serve dist` не является API backend, `/api/v1/favorites` отвечает 404, а тесты, ожидающие auth/data fixtures, не получают cargo/deal cards. Downstream failures следуют из этого состояния. Это не исправляется frontend assertion weakening.

## Android

- Existing installed `com.urtruck.app` `1.0.7` запускался на Android 15 и Android 16 без `FATAL EXCEPTION`; это старый APK, не artifact текущего SHA.
- RC build из текущего SHA локально не собран: Gradle остановился на JDK `26.0.1` при Expo/RN toolchain, с ошибкой Kotlin parser `IllegalArgumentException: 26.0.1`. CI workflow требует JDK 17.
- `npx expo-doctor`: **16/18 checks passed, 2 failed**: native folders не синхронизируют app.json через CNG, `expo-av` отмечен как unmaintained.
- `google-services.json` отсутствует локально. CI уже требует secret `ANDROID_GOOGLE_SERVICES_JSON_BASE64`, materializes it ephemerally и проверяет package/plugin/resources. Secret не коммитился.
- Physical RC flows, Maestro installed-RC flows, FCM foreground/background/terminated, GPS/background and documents не доказаны.

## iOS

- iPhone 17 Pro simulator booted, но UrTruck bundle отсутствует; установлены сторонние bundles, UrTruck UI не запускался.
- Physical iPhone/TestFlight недоступен. iOS login/chat/voice/push/GPS/documents/map flows не выполнялись и PASS не заявляются.

## Providers and product modules

- Push: backend ownership/idempotency/security contracts PASS; реальная FCM/APNs delivery не проверена.
- GPS/routing: static consent/route contracts PASS; `YANDEX_ROUTER_API_KEY` не предоставлен, поэтому real road polyline и live provider path не проверены.
- Documents: backend contract/security tests PASS; real private upload/signed URL/large-file retry физически не проверены.
- Chat/voice: frontend/backend contracts PASS; real device receiver voice, 60-second voice, playback, translation and push не проверены.
- Localization: RU/ZH/EN/KK static/runtime smoke PASS; full desktop locale flows blocked by missing API/auth fixtures.

## Severity and decision

- P0: genuine unauthorized access не найден в выполненных security tests.
- P1: desktop canonical E2E не зелёный; native RC build unavailable locally; Firebase config secret unavailable locally; physical iOS/provider/device validation absent; runtime dependency audit still has 1 critical and 11 high; real lint/typecheck CI proof not yet observed on GitHub.
- P2: npm deprecation warnings and toolchain maintenance debt.

## Changed files

- `package.json`, `package-lock.json`
- `scripts/staticCheck.mjs`
- `.github/workflows/pr-quality-gate.yml`
- `.github/workflows/qa-center.yml`
- `src/screens/ChatScreen.js`
- `tests/frontend/cargo_feed_density_contract.test.mjs`
- `tests/frontend/test_deal_workspace.mjs`
- `tests/frontend/test_global_road_routing.mjs`
- `tests/frontend/test_status_push_pro_filter_contract.mjs`
- `qa/RELEASE_BLOCK_5_REPORT.md`

## Verdict

**BLOCKED WITH EVIDENCE**

Release blockers remain because the canonical desktop suite, native RC build, real provider delivery and physical iOS/device coverage are not all green/proven. No secrets were committed and no production changes were made.
