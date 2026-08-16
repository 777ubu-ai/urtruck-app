# UrTruck RC #190 — NO-GO gate

Дата: 2026-08-16
Branch: `agent/urtruck-fix-security-freeze-20260815`
Latest reviewed remote HEAD before this update: `37bed1553df857398057d007ddf366c20f4ce613`
PR: #190

## Verdict

**NO-GO**

PR остаётся draft/review-only. Merge в `main` и production deploy запрещены до отдельного pre-production `GO` от Tom.

## Critical branch sync warning

Latest known remote PR head is ahead of the local Codex worktree reported by the agent.

- Local report HEAD: `f88f012bfc49b770a7517de10f02acda9e1233cc`
- Remote PR head before this doc update: `37bed1553df857398057d007ddf366c20f4ce613`

Before any future local push from `/private/tmp/urtruck-fix.8Gf2a1`, the agent must first fetch and rebase/merge the remote branch safely.

Required sequence:

```bash
git status
git fetch origin
git log --oneline --decorate --graph --max-count=12 HEAD origin/agent/urtruck-fix-security-freeze-20260815
```

Then integrate remote changes without force-push. Do not use `git push --force`. Do not overwrite the remote branch.

Current uncommitted local files from the agent report:

- `M package-lock.json` after `npm ci`
- `?? qa-artifacts/`
- `?? qa/artifacts/`

These must be handled before sync:

- generated QA artifacts should not be committed unless explicitly required;
- `package-lock.json` should only be committed if it is a deliberate dependency remediation and passes `npm ci` + `build:web`.

## Что подтверждено через GitHub

- PR #190 открыт и находится в draft.
- PR технически mergeable/merge-state может меняться после new commits, but this is not release approval.
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

- `package.json` has no `image-size` override after local cleanup.
- `npm ls image-size` resolves `react-native@0.76.9 -> metro -> image-size@1.2.1`.
- `npm ci`: PASS.
- `npm run build:web`: PASS after restoring Metro-compatible `image-size@1.2.1`.
- `npm audit --audit-level=high`: still FAIL with 6 high advisories through Metro/image-size.
- Remaining high advisories: `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq` through `image-size`.
- `npm audit fix` still proposes only `--force`, with breaking `react-native@0.72.17`; do not apply.
- Local `image-size: 2.0.2` override experiment was rejected because web export fails with `TypeError: getImageSize is not a function`.
- `npm run qa:center:quick`: PASS after restoring build-compatible dependency state.
- `npm run qa:full`: FAIL because `ensure-actor` requires valid `QA_AGENT_TOKEN` for `/api/v1/qa/ensure-actor`.
- `npm run qa:auditor`: FAIL with P0 ensure-actor failures in `agent-currency`, `agent-serik`, `agent-boris` when `QA_AGENT_TOKEN` is absent/invalid.
- `npm run qa:secrets`, `qa:i18n`, `qa:ux`, `qa:trip-status`, `qa:gps-consent`: PASS.
- Backend suite: `324 passed`.
- `npx pod-install --silent --repo-update`: PASS.
- `npm run ios`: FAIL Code 65 after toolchain/module errors (`_Builtin_float`, `_DarwinFoundation*`, `simd`, `EXAV.modulemap`), indicating Xcode/Swift module cache/toolchain environment needs repair before clean iOS verification.
- `npm run qa:center:maestro:smoke`: FAIL, `qa-debug-block is visible`.
- `adb devices`: no connected devices; Android runtime is BLOCKED by environment.
- `./gradlew :app:assembleDebug`: FAIL resolving `com.facebook.react.settings` / `26.0.1`, so Android build/toolchain still requires local environment repair.

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

## Current dependency/security decision candidate

Based on the latest local report, the only currently viable path is **B: documented accepted build-time dependency risk**, unless a real Metro-compatible compatibility patch is produced.

This decision is not automatic. It requires evidence:

```bash
npm ls image-size
npm explain image-size
grep -R "image-size\|getImageSize\|imageSize" -n src backend App.js app.json metro.config.js package.json package-lock.json qa tests || true
```

Expected evidence to verify:

- `image-size` appears only through Metro dependency chain.
- UrTruck `src/`, `backend/`, QA/runtime app code do not import it directly.
- User uploads/documents/photos are handled through app/backend/storage code, not Metro.
- Production users cannot submit files into Metro build-time asset discovery.

If those are proven, the release record may state:

`Dependency audit remains red because npm has no compatible fixed image-size release for Metro/RN 0.76/Expo 52. Risk accepted as build-time-only dependency with upgrade ticket; not treated as production runtime exploitability.`

Tom must approve this wording independently.

## Other current blockers from latest local report

### 1. Auditor / ensure-actor P0

`qa:full` and `qa:auditor` show P0 ensure-actor failures because valid `QA_AGENT_TOKEN` is not available in the local environment.

Do not weaken actor checks. Required paths:

- provide the expected QA token to local environment;
- run local backend with matching QA settings;
- or mark this gate BLOCKED by missing QA secret, not PASS.

### 2. Web build

`npm run build:web` is PASS only when using the Metro-compatible `image-size@1.2.1` state. It is FAIL with `image-size@2.0.2`. Keep the build-compatible state until a real compatibility patch exists.

### 3. iOS build

The latest local failure points to Xcode/Swift module cache/toolchain issues after `pod-install` rather than only product source errors. Required local next steps:

- clear DerivedData for this app only;
- reset Xcode module cache;
- verify selected Xcode path;
- verify simulator runtime exists;
- reinstall Pods if needed;
- run clean `xcodebuild` and capture full log.

Do not mark iOS PASS until build/install/launch evidence exists.

### 4. Maestro runtime

`qa:center:maestro:smoke` fails because `qa-debug-block` is visible. This is runtime evidence of an app/test-state problem, not a YAML contract PASS.

### 5. Android runtime

Android is not verified because no connected device/emulator was available. Gradle/plugin resolution also still requires local environment repair. This is environment BLOCKED, not PASS.

### 6. Production-smoke

Production-smoke intentionally отделён от local QA and must run only after deployment of the expected SHA.

### 7. Yandex MapKit approval/key

No GitHub evidence confirms Yandex approval or active restricted production MapKit keys. Need external confirmation from Yandex dashboard or owner.

## What is currently PASS

- Backend tests: `324 passed` from local report.
- `npm ci` in build-compatible dependency state.
- `npm run build:web` in build-compatible dependency state.
- `npm run qa:center:quick` in build-compatible dependency state.
- Standalone smoke scripts from local report:
  - `qa:secrets`
  - `qa:i18n`
  - `qa:ux`
  - `qa:trip-status`
  - `qa:gps-consent`
- GitHub PR remains draft and not merged.

## What cannot be called PASS

- Dependency security / audit gate.
- Full `qa:full`.
- Auditor.
- iOS build.
- Android build/runtime.
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
- Do not push from stale local HEAD over remote updates.

## Next safe execution order

1. Sync local worktree with remote branch safely, no force-push.
2. Discard/move generated artifacts out of git status.
3. Commit `package-lock.json` only if it represents a deliberate dependency decision and all relevant gates pass; otherwise restore it.
4. Keep Metro-compatible `image-size@1.2.1` unless a real compatibility patch exists.
5. Complete build-time dependency risk evidence and Tom verification.
6. Run `qa:full`/`qa:auditor` with valid `QA_AGENT_TOKEN`; if the token is unavailable, mark gate BLOCKED by missing QA secret.
7. Fix Maestro runtime `qa-debug-block` failure.
8. Repair local iOS Xcode/Swift module/toolchain state and re-run clean iOS build/install/launch.
9. Repair Android toolchain/device/emulator and re-run Android build/install/launch.
10. Push final fixed branch.
11. Wait for GitHub Actions.
12. Tom pre-production GO only after all release blockers are closed.

## Current release statement

UrTruck RC #190 is still **NO-GO**.

The latest local attempt proved that naive `image-size@2.0.2` override is not viable because it breaks Expo/Metro web export. The current viable path is either a real Metro-compatible compatibility patch or a documented build-time accepted-risk decision with independent reachability verification.
