# URTRUCK QA REPORT — Golden candidate

Date: 21.09.2026
Branch: `integration/urtruck-golden-candidate-20260921`
Tested code SHA: `2e9abdeff3b152a5851f9d240668f0378315bb1a`
Base SHA: `5f996baef5165268c72f67bea70a7f3acb57bd3e`
Merge-base with `origin/main`: `9b40722c44d8ff6ac3ad0c38a58224383f4bef0c`
Confirmed production SHA/version: UNKNOWN

## CHANGED

- Added mandatory engineering constitution and Golden Baseline.
- Restored compact route layout: ordinary route stays on one line.
- Added compact two-level rendering for Dulaty/Kalzhat and Chuguchak/Bakhty.
- Date field now always opens the loading-date calendar.
- Added route/calendar regression assertions.

## UNCHANGED / PROTECTED

- Deal FSM, auth, database/RLS and navigation contracts.
- Chat, Voice/STT/Translation, Push, GPS, Maps and Documents implementations.
- Marketplace card dimensions, price rail and bookmark.
- No dependency upgrade, migration, production deploy or APK build.

## TESTS

- Frontend unit/regression: **779/779 PASS**.
- Backend full pytest: **901/901 PASS**; 297 warnings.
- Backend Translation/STT subset: **32/32 PASS**.
- Backend Push subset: **111/111 PASS**.
- Backend Map/GPS subset: **40/40 PASS**.
- Frontend Voice/Translation: **10/10 PASS**.
- Frontend Push effective matrix: **64/64 PASS**.
- Frontend Map/GPS effective matrix: **116/116 PASS**.
- Route/calendar targeted checks: **18/18 PASS**.
- Lint: PASS (403 active JavaScript files).
- QA Center quick: PASS; i18n 2019 keys × RU/EN/KK/ZH, missing 0.
- Maestro contract validation: PASS for 70 flows.
- Web export, navigation, currency, theme/WCAG, geography: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- Python `pip check`: no broken requirements.
- `git diff --check`: PASS.
- TypeScript typecheck: N/A; repository has no `tsconfig*.json`.

## PHYSICAL DEVICES

- Not run for this source SHA: no APK was built by owner instruction.
- Prior QA073 screenshots remain historical evidence only.
- Required next matrix: Xiaomi RU shipper, Xiaomi ZH driver, OPPO second driver.
- iPhone remains mandatory later and is not replaced by OPPO.

## PRODUCTION

- Not touched. No deploy, upload, TestFlight, Play Console, merge, tag or push.

## REGRESSIONS FOUND / FIXED

- Fixed in source: ordinary route wrapping/truncation and date-picker open action.
- Translation, Push and Map/GPS were not rewritten: source suites are green;
  their QA073 failures require runtime/configuration retest on one exact build.

## KNOWN RISKS / BLOCKERS

- Physical Android critical path has not run on this candidate SHA.
- Provider quota/configuration can still block live Translation/STT.
- Firebase and MapKit secrets must be present in the eventual QA build.
- OPPO sound/deeplink, two-driver concurrency and third-party isolation are open.
- iOS physical visual regression is pending.
- Production SHA is still unknown.

## FINAL STATUS

**AUTOMATIC GATE: PASS. RELEASE STATUS: BLOCKED.**

Next permitted step requires owner confirmation: create one QA build from the
final Golden SHA, install the same artifact on all three Android phones, and run
the physical matrix with screenshots. No claim of 10/10 is made.
