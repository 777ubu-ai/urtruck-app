# C2 — CI FORENSIC (baseline c4501ece, read-only)

Handoff для Codex (Track A: A3/A4 — инвентаризация coverage и P0-гейт).
Факт 0: workflow-файлов **16**, а не 17 (`ls .github/workflows/`).

## Machine-readable инвентарь workflow'ов

| Файл | Trigger | Тесты (команды) | Может упасть | False-green | Prod deploy | Manual bypass |
|---|---|---|---|---|---|---|
| full-qa-audit.yml | PR→main (:4), dispatch (:6) | pytest изолированно по каждому test_*.py (:49-58); playwright qa/ + mobile конфиги (:123); maestro YAML-валидация + qa:maestro-contract (:151-152); qa:center:quick (:185); tests/frontend loader (:188) | Да (`test "$failed" -eq 0` :66, `test "$suite_rc" -eq 0` :128) | **Да — P0** (ниже) | Нет | dispatch без guard |
| pr-quality-gate.yml | PR→main (:4), dispatch (:6) | backend pytest (:50/53); 3 frontend ownership/currency теста (:73-75); social-auth контракты (:78-81); deploySshSecurityGuard (:83); borderDashboardSmoke (:85); qa:gps-consent (:88-89); qa:i18n (:91); qa:ux (:93); build:web (:97) | Да (set -euo pipefail :41) | Не обнаружено | Нет | dispatch без guard |
| qa-center.yml | PR→main (:4), dispatch (:6) | qa:center:quick (:29); maestro YAML+runFlow (:49-70) | Да | Не обнаружено | Нет | dispatch без guard |
| deploy.yml | push→main (:4), dispatch (:6) | gate-only: Yandex-key проверка (:40-66), build:web (:73-77), 4 map-контракта (:83-86) | Да | Не обнаружено (429→warning :62-65) | Нет (writer = secure-production-deploy, комментарий :8-12) | dispatch (gate-only, безопасен) |
| secure-production-deploy.yml | workflow_run после deploy.yml (:4-6), dispatch (:7) | build:web (:63), rsync по SSH (:130,:157), PM2 health (:159), public proof curl (:187-211) | Да | Не обнаружено | **Да — единственный writer.** Gates: head_branch==main && conclusion==success (:18), environment: production (:20), checkout DEPLOY_SHA (:43) | **dispatch обходит job-if; деплоится github.sha диспатченной ветки (:23,:43). Частичный контроль — environment approval (состояние env из репо не видно, BLOCKED)** |
| deploy-play.yml | push→main paths (:29-37), dispatch (:38) | gradlew bundleRelease (:177), upload-google-play (:207) | Да (keystore/firebase fail-closed :120-123,:137-140) | Не обнаружено | **Да — Google Play, track default internal (:212-213)** | **dispatch: `track: production` без environment-approval, без branch/SHA guard (:39-58)** |
| testflight-rc.yml | push→main paths=[сам файл] (:8-12), dispatch (:7) | eas build ios (:96), eas submit (:116); verify BUILD_COMMIT==HEAD (:104) | Да | submission:view \|\| true (:125) — только в if: failure(), статус не влияет | Да — TestFlight | dispatch → job-if разрешает (:23), но шаг :52 требует main |
| build-android-apk.yml | push→main и claude/** (:9-10), dispatch (:8) | assembleRelease (:108) + GitHub Release (:129-138) | Да | Не обнаружено | Нет | dispatch без guard |
| build-android-dev-client.yml | dispatch only (:13) | assembleDebug (:88) | Да | google-services best-effort (:68-72) by design | Нет | dispatch (безопасен) |
| google-play-location-video.yml | push→main paths (:4-10), dispatch source_sha (:11-17) | assembleRelease (:152), emulator+run-ci-video.sh (:189) | Да | Не обнаружено | Нет (evidence в issue #247 :227-231) | dispatch без guard |
| reviewer-auth-ci-diagnostic.yml | push→main, 5 paths (:5-14), dispatch (:4) | скачивание закреплённого APK artifact 9569835383 + SHA256 (:122-143), emulator+maestro (:157-175) | Да | Не обнаружено | Нет | dispatch без guard. **Закреплён на историческом artifact — перестанет работать после expiry** |
| production-performance-diagnosis.yml | dispatch only (:4) | SSH read-only free/ps/pm2/ss/curl (:32-63) | Да | \|\| true на командах сбора (:39-62) by design | Нет | dispatch (read-only) |
| production-backup.yml | dispatch only (:4) | sqlite .backup+quick_check (:84-86), .env, tar storage/nginx, SHA256SUMS (:150-152) | Да | \|\| true на необязательном (:133,:136-138); DB-backup fail-closed (:94-95) | Нет (мутация pm2 save :137) | dispatch без guard, environment нет |
| set-file-signing-key.yml | dispatch only (:22) | генерация FILE_SIGNING_KEY на сервере (:58-59), health (:64-65) | Да | Не обнаружено | Да — мутация prod | dispatch; environment: production (:36) |
| configure-social-auth.yml | push→main 3 paths (:5-11), dispatch (:4) | configure_social_auth_providers.sh google (:86) + apple (:221 условно) | Да (google fail-closed :45-60) | Не обнаружено | Да — мутация Supabase auth config | dispatch без guard |
| yandex-map-finalizer.yml | workflow_run после deploy (:6-8) | verify-only curl (:30-39) | Да | Не обнаружено | Нет | dispatch отсутствует |
| push-production-smoke.yml | push→main (:4) | ждёт build-info.json GITHUB_SHA ≤10 мин (:21-31), push diagnostics (:38-43) | Да (exit 1 :31) | if: always() на evidence (:47) — не глотает failure | Нет | dispatch отсутствует |

**Schedule-триггеров нет ни в одном workflow** (grep `schedule:` — 0).

## False-green пути (подтверждены, с координатами)

1. **QA P0/P1 не роняют exit code — ПОДТВЕРЖДЕНО.**
   - `qa/utils/qaReport.js:44` — `p0:` только пишет запись в JSON-state. Ни `process.exit`, ни `exitCode`, ни throw по P0.
   - Единственное чтение `counts.P0` — `console.log` в `qa/agents/auditor.full.spec.js:120`.
   - Все ~200 вызовов `log.p0(...)` в спеках не бросают исключений.
   - Итог: `npx playwright test --config qa/playwright.config.js` в `full-qa-audit.yml:123` выходит 0 при любом числе P0; `test "$suite_rc" -eq 0` (:128) проверяет только exit code playwright. → зелёный PR при P0-регрессиях.
2. **`npm run test:e2e` (root playwright.config.js, tests/e2e) не вызывается НИГДЕ в CI — ПОДТВЕРЖДЕНО** (grep по .github/ — 0). Из 22 спек в CI попадает ровно одна — urtruck-runtime-crash-regression (через qa/playwright.config.js:37-41).
3. **`tests/unit/dealStatusOrder.test.mjs` ни в одном CI-запуске — ПОДТВЕРЖДЕНО** (grep по .github/ и package.json — 0). Из tests/unit в CI только themeResolve (`qa:theme-unit` в `qa:center:quick`). Бонус: `tests/unit/dealsUnread.test.mjs` тоже нигде не вызывается.
4. **deploy-play.yml: manual bypass в production** — dispatch `track: production` (:46-49) без environment-approval и branch-проверки.
5. **secure-production-deploy.yml: dispatch обходит gate** (:18 job-if пропускает workflow_dispatch; деплоится github.sha диспатченной рефы :23,:43). Контроль: environment: production (:20) — если настроены required reviewers (из репо не видно — BLOCKED).

## Дополнительные факты

- Secrets availability guards fail-closed: deploy-play.yml:120-123,:137-140; build-android-apk.yml:78-81; secure-production-deploy.yml:59-62,:110-113; configure-social-auth.yml:45-60; testflight-rc.yml:52-58; production-backup.yml:37-39; google-play-location-video.yml:133-136.
- `testflight-rc.yml:125` `|| true` — только в if: failure() шаге (диагностика).
- `push-production-smoke.yml:22` `|| true` внутри retry-цикла, финальный `exit 1` присутствует (:31).

## BLOCKED (нет доступа к GitHub API/repo settings)

- Конфигурация Environment `production` (required reviewers?) — не видна из репо.
- История/статус последних CI-прогонов.
