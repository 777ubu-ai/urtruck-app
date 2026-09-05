# UrTruck Release Candidate Report

Дата проверки: 2026-09-05. Ветка: `arch/urtruck-foundation-v2-0001`.

## 1. Ревизии

- Baseline: `d91653f755012326d8cb7331fa0e7f9f9e4a0a93`.
- Проверяемый HEAD: итоговый commit этого отчёта; точный SHA зафиксирован в git history и финальном отчёте агента.
- Foundation V2 flag: `DEALS_V2_ENABLED` не включён; default остаётся `false`.
- Commits текущего блока: `a8eb4cd4ae893009d3e1b58fb4230b399fdaf942` и commit этого отчёта.

## 2. Backend

- Canonical `PYTHONPATH=. /tmp/urtruck-foundation-v2-pytest312/bin/pytest -q backend/tests`: **431 passed, 0 failed, 0 skipped, 0 xfailed**, 218 warnings, 13.62 s.
- Foundation V2 после canonical suite: **17 passed, 0 failed**, 1 warning, 0.26 s.
- Security/IDOR/push subset: **49 passed, 0 failed**, 44 warnings, 1.41 s.
- FSM/country/expiry subset: **47 passed, 0 failed**, 2 warnings, 1.40 s.
- Rollback, idempotency, outbox, concurrency и legacy write-path guards входят в canonical backend regression и проходят.

Изолированный запуск `backend/tests/foundation` на чистом процессе до общей инициализации падает на `no such table: border_checkpoints`; это test-only порядок инициализации общей SQLite-схемы. Production-код для этого не изменялся. После canonical invocation Foundation subset проходит полностью.

## 3. Frontend

- `node --experimental-loader ./tests/frontend/loader.mjs --test tests/frontend/*.mjs tests/unit/*.mjs`: **375 passed, 0 failed, 0 skipped**, 1.60 s.
- `npm run qa:center:quick`: **PASS**. RU/EN/KK/ZH: 1965 i18n keys, 0 missing call-site keys; geo, currency, theme/contrast, navigation, documents, GPS consent, buttons и contract checks PASS; `build:web` PASS.
- `npm ci`: PASS, но `npm audit --omit=dev` сообщает 2 critical, 19 high, 24 moderate, 1 low vulnerabilities. Это release blocker до dependency review.
- Lint/typecheck scripts в `package.json` отсутствуют; typecheck не может быть доказан. `tsconfig.json` отсутствует.

Исправлен подтверждённый crash при открытии status history: `statusLabel` использовался в `DealStatusTimeline`, но не был объявлен. Добавлена регрессия через существующий frontend contract suite. Несколько static assertions синхронизированы с уже принятыми UI-изменениями: Android safe-area inset, fixed compact header, composer dimensions и fail-closed web route fallback.

## 4. Web / Playwright

- Mobile Playwright `qa/playwright.mobile.config.js`: **36 passed, 0 failed** за 1.7 min. Это browser emulation, не physical device QA.
- Canonical desktop `playwright.config.js`: **9 passed, 47 failed, 7 skipped, 7 did not run** из 70.
- Основные причины failures: static server не является API backend; ожидаемые mock/data/auth fixtures отсутствуют, `/api/v1/favorites` получает 404 и превращает console-error assertions в failures; связанные сценарии не получают cargo/deal cards. Это нельзя считать product PASS.

## 5. Security / FSM / side effects

- Backend security/IDOR subset: PASS, genuine unauthorized access в выполненных тестах не найден.
- FSM/country/border/expiry: PASS по backend subset и frontend contracts.
- Push/Chat/GPS/Documents не выполняют business mutation внутри Deals transaction в Foundation V2 проверках; реальные provider side effects текущим локальным прогоном не подтверждены.
- Domain outbox сохраняет at-least-once модель; consumers должны быть idempotent. Exactly-once delivery не заявляется.

## 6. Chat, Push, GPS, Documents, Localization

- Chat: frontend contract/unit coverage PASS; physical iOS/Android chat, voice, translation, keyboard и terminated push flows не выполнены.
- Push: backend push ownership/security tests PASS; real APNs/FCM foreground/background/terminated matrix не выполнена.
- GPS/map: static GPS-consent, route and localization contracts PASS; live road routing, background queue/reconnect и outsider coordinate access на physical devices не доказаны. `YANDEX_ROUTER_API_KEY` в текущем test environment не предоставлен, поэтому реальная provider route не проверялась.
- Documents: contract/security tests PASS; реальный private upload, signing, retry и large-file flow не выполнены.
- Localization: RU/EN/KK/ZH static/runtime smoke PASS; full locale Playwright paths не прошли из-за отсутствующего API/auth state.

## 7. Device evidence

- Android 15 (`4PYDDI4DHIXS5DD6`) и Android 16 (`BUA6JB99T465Q49X`) имеют установленный `com.urtruck.app` `1.0.7`; launch и screenshot выполнены, `FATAL EXCEPTION` не найден. APK не собран из текущего SHA, поэтому это smoke evidence существующего binary, не RC proof.
- Expo Go package `host.exp.Exponent` отсутствует; Maestro smoke не запускался.
- iPhone 17 Pro simulator booted, но UrTruck bundle не установлен. iOS login/chat/push/GPS/documents не выполнялись и PASS не заявляются.
- Native Expo export показывает warning: `android.googleServicesFile: "./google-services.json"`; файл отсутствует. Android release build/signing/push readiness не доказаны.

## 8. P0/P1 и blockers

- P0 security defect: не найден в выполненных backend security tests.
- P1/release blockers: canonical desktop web suite не проходит; physical iOS QA отсутствует; Android RC config lacks `google-services.json`; dependency audit reports high/critical vulnerabilities; lint/typecheck gates не настроены; real provider push/GPS/routes/doc uploads не подтверждены.
- Исправлен P1 code regression: status-history `statusLabel` crash.

## 9. Remaining legacy / product scope

Foundation V2 backend regression и Deals/Bids integration gate остаются зелёными; legacy compatibility paths сохраняются по approved migration policy. В этом блоке не менялись FSM, REST contracts, production flags, Chat V2, Push V2, Realtime, Redis, PostgreSQL, Documents V2 или GPS V2.

## Verdict

**BLOCKED WITH EVIDENCE**

Причина: release candidate не может быть рекомендован до исправления canonical desktop E2E environment/failures, dependency/configuration blockers и выполнения physical iOS + native Android RC validation. Merge в `main`, deploy и production enablement не выполнялись.
