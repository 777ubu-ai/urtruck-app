# UrTruck RC #190 — NO-GO gate

Дата: 2026-08-16
Branch: `agent/urtruck-fix-security-freeze-20260815`
Latest reviewed remote HEAD before this update: `ade94022b164f2d29bb160ad1b6359a4020d174e`
PR: #190

## Verdict

**NO-GO**

PR остаётся draft/review-only. Merge в `main` и production deploy запрещены до отдельного pre-production `GO` от Tom.

## Что подтверждено через GitHub

- PR #190 открыт и находится в draft.
- PR технически mergeable, но это не release approval.
- Branch ahead of `main`, без behind на момент проверки.
- Изменений много: backend, security, GPS, iOS Pods, workflows, QA, Playwright, Maestro, frontend, package-lock.

## CI / GitHub Actions по remote branch

### PASS

- QA Center quick gate ранее проходил на `f88f012`.
- QA Center Maestro flow contract проходил по YAML/contract validation.
- Backend tests в PR Quality Gate проходили.
- API and backend regression в Full QA Audit проходил.
- Playwright mobile visual audit проходил.

### FAIL / BLOCKER

- PR Quality Gate / Frontend tests and build: FAIL на шаге `Dependency audit`.
- Full QA Audit / Playwright desktop visual audit: FAIL на шаге `Run desktop Playwright suite`.
- Full QA Audit / Design, FSM and UX gate: FAIL на шаге `Release dependency and secret gates`.

## Local Codex report received after dependency remediation attempt

Local worktree: `/private/tmp/urtruck-fix.8Gf2a1`

User/Codex report states:

- `npm install`: ran without `--force`.
- `npm ci`: ran.
- `npm audit --audit-level=high`: still FAIL.
- Remaining high advisories: `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq` through `image-size`.
- `npm audit fix` still proposes only `--force`, with breaking `react-native@0.72.17`; do not apply.
- Local `package.json` experiment used override `image-size: 2.0.2`.
- `npm view image-size versions` reported max available version `2.0.2`; `2.0.3+` is not available on npm.
- `npm ci` installed `image-size@2.0.2`, but web export fails with `TypeError: getImageSize is not a function`.
- `npm run qa:center:quick`: falls at `build:web` due to the same `getImageSize` mismatch.
- `npm run build:web`: FAIL, same `getImageSize` mismatch.
- `npm run qa:full`: FAIL with `P0=9 P1=5 P2=16 pass=13`, main failures in `ensure-actor` layer.
- `npm run qa:auditor`: FAIL with `P0=4` in `agent-currency`, `agent-serik`, `agent-boris` ensure-actor.
- `npm run qa:secrets`, `qa:i18n`, `qa:ux`, `qa:trip-status`, `qa:gps-consent`: PASS.
- Backend suite: `324 passed`.
- `npm run android`: environment/device FAIL, no Android connected device/emulator.
- `npm run ios`: FAIL Code 65, missing `node_modules/react-native/React/Fabric/RCTThirdPartyFabricComponentsProvider.mm`.
- `npm run qa:center:maestro:smoke`: FAIL, `qa-debug-block is visible`.

## Dependency conclusion as of this update

The earlier documented `image-size@2.0.3+` remediation path is **not currently actionable** because the local npm registry query reports no `2.0.3+` release.

`image-size@2.0.2` is also **not a safe drop-in remediation** for this stack because Expo/Metro export fails with:

```text
TypeError: getImageSize is not a function
```

This indicates an API/export contract mismatch with Metro/Expo usage, not just a lockfile problem.

Therefore, do not apply a naive package override to `image-size@2.0.2` unless Metro/Expo code is proven compatible or patched with full regression.

## Required next dependency path

One of these must be completed before release:

### A. Safe compatibility patch

Create a version-scoped, tracked compatibility patch that lets Metro continue to call the expected image-size API while using the safest available implementation/version. Requirements:

- No `npm audit fix --force`.
- No React Native downgrade.
- No global Metro/RN upgrade without Expo compatibility proof.
- Reproducible via `npm ci`.
- `npm run build:web` must PASS.
- `npm audit --audit-level=high` outcome must be documented.
- If audit still flags because no fixed version exists, see B.

### B. Documented accepted build-time dependency risk

If no patched package exists on npm and the package is only reachable through Metro build-time asset processing, document this as accepted build-time dependency risk, not fixed. Requirements:

- Prove no UrTruck production backend/mobile/web runtime path imports `image-size`.
- Prove it is introduced through Metro build tooling only.
- Prove user-uploaded production files do not reach Metro.
- Keep `image-size` at the Metro-compatible version if override breaks export.
- Add an upgrade/removal ticket for Metro/RN/Expo when upstream publishes a compatible fix.
- Tom must independently verify reachability analysis.

## Other current blockers from latest local report

### 1. Auditor / ensure-actor P0

`qa:full` and `qa:auditor` show P0 ensure-actor failures for `agent-currency`, `agent-serik`, `agent-boris`.

Do not weaken actor checks. Fix root cause:

- stale QA agent setup;
- missing seeded actor;
- role/session mismatch;
- old test assumptions;
- or real regression.

### 2. Web build

`npm run build:web` is currently blocked by `image-size@2.0.2` API mismatch. Restore a Metro-compatible dependency state or implement a proven compatibility patch.

### 3. iOS build

`npm run ios` fails Code 65 because `node_modules/react-native/React/Fabric/RCTThirdPartyFabricComponentsProvider.mm` is missing.

This is a separate blocker from the previous fmt/Xcode issue. Investigate whether it is caused by:

- broken/incomplete `npm install` state;
- React Native codegen not generated;
- Pods/project referencing a generated file that does not exist;
- stale native project file;
- lockfile/dependency mismatch.

### 4. Maestro runtime

`qa:center:maestro:smoke` fails because `qa-debug-block` is visible. This is runtime evidence of an app/test-state problem, not a YAML contract PASS.

### 5. Android runtime

Android is not verified because no connected device/emulator was available. This is environment BLOCKED, not PASS.

### 6. Production-smoke

Production-smoke intentionally отделён от local QA and must run only after deployment of the expected SHA.

### 7. Yandex MapKit approval/key

No GitHub evidence confirms Yandex approval or active restricted production MapKit keys. Need external confirmation from Yandex dashboard or owner.

## What is currently PASS

- Backend tests: `324 passed` from local report.
- Standalone smoke scripts from local report:
  - `qa:secrets`
  - `qa:i18n`
  - `qa:ux`
  - `qa:trip-status`
  - `qa:gps-consent`
- GitHub PR remains draft and not merged.

## What cannot be called PASS

- Dependency security.
- Web build on the local dependency experiment.
- Full `qa:full`.
- Auditor.
- iOS build.
- Android runtime.
- Maestro runtime.
- Production-smoke.
- Yandex approval.
- Tom final GO.

## What cannot be done

- Do not merge #190.
- Do not deploy production.
- Do not mark Ready for review.
- Do not run `npm audit fix --force`.
- Do not accept `image-size@2.0.2` while it breaks Web export.
- Do not mark Maestro YAML validation as runtime PASS.
- Do not mark Android as PASS without device/emulator evidence.
- Do not claim Yandex approval without dashboard/email evidence.

## Next safe execution order

1. Revert local `image-size@2.0.2` override if it is still present and still breaks Web export, or replace it with a proven compatibility patch.
2. Restore `npm ci` + `npm run build:web` PASS.
3. Decide dependency security path: compatibility patch or accepted build-time dependency risk with reachability proof.
4. Fix `ensure-actor` P0 in `qa:full`/`qa:auditor` without weakening actor security.
5. Fix Maestro runtime `qa-debug-block` failure.
6. Fix iOS missing Fabric generated file / codegen/native project issue.
7. Re-run local gates:
   - `npm ci`
   - `npm audit --audit-level=high` or documented accepted risk gate
   - `npm run qa:center:quick`
   - `npm run qa:full`
   - `npm run build:web`
   - backend tests
   - iOS build/install/launch
   - Android emulator/device
   - Maestro runtime
8. Push final fixed branch.
9. Wait for GitHub Actions.
10. Tom pre-production GO only after all release blockers are closed.

## Current release statement

UrTruck RC #190 is still **NO-GO**.

The latest local attempt proved that naive `image-size@2.0.2` override is not viable because it breaks Expo/Metro web export. The next solution must either be a real compatibility patch or a documented build-time accepted-risk decision with independent reachability verification.
