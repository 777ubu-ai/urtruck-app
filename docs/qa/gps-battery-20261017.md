# GPS battery investigation — 2026-10-17

## PRE-FLIGHT
- Branch: `fix/gps-battery-background-20261017`; base/source `3f819baabf0b59f5f67f8f3877223ec4db635d30`. Production/iPhone installed SHA: UNKNOWN.
- Owner evidence: iPhone screenshot, 14 min on-screen / 13 h 21 min background; owner confirms active trip. Installed-build energy cause is NOT proven by source inspection.
- Known-good: historical QA072 Android 30 min GPS; not a PASS for this patch/iOS. PR558 device acceptance belongs to another operator and is untouched.
- Scope: `useDealLocationBroadcast.js`, `backgroundLocation.js` and targeted runtime tests. Protect design/sizes, FSM, ownership/auth, durable FIFO, Android foreground-service/permissions, active-trip background tracking, production and devices.
- Checks: runtime fake lifecycle/timers, native task idle/offline/session race, existing GPS/logout/queue suites, lint and full frontend suite. iOS energy/device test pending.
- Rollback: discard/revert this isolated patch; no deploy, device/system settings, server or database mutations.

## Findings
- Foreground sampling (25 s) and active-deal polling (15 s) had no background gate; foreground sampling may overlap native tracking and requests.
- Native callback reconciles empty authoritative active-deal IDs but previously left OS location task registered until a UI hook stopped it.
- Existing iOS options disable auto-pause and use distanceInterval=0. Android timeInterval is not an iOS timer. These settings remain unchanged here: automatic pause could lose stationary heartbeat/restart guarantees; adaptive sampling needs separate measured acceptance.

## Historical patch and verification (122a6659)
- UI location sampling and active-deal polling run only while AppState is active, clean up timers on background, and reject late samples. Requests are single-flight. Native active-trip tracking remains registered in background.
- Headless native callback stops OS tracking after a validated empty server response. Offline/malformed/session-changed responses never authorize stop. Queued stop rechecks current account and active IDs; the existing lifecycle lock serializes stop/start/logout without holding the FIFO lock. Durable queue is preserved.
- New runtime tests on BASE source: 3 expected failures (background UI work, overlapping sample, headless native stop), 2 passes.
- Full frontend/unit suite after implementation: 1297/1297 PASS. Two subsequent test-only race cases added: final targeted GPS/logout/FIFO set 44/44 PASS, including start-vs-stop and retry of failed native stop.
- Lint: 524 active JS files PASS. Web export/finalizer PASS. Diff whitespace PASS. No backend/API/schema/dependency/UI/size changes.

## Historical limitations (122a6659)
- Independent review and CI pending until PR publication. No APK/IPA builds, deployment or device changes from this branch.
- No measured iOS energy improvement yet. Need identify installed iPhone build/source and compare background idle, active moving, stationary, offline/reconnect, terminal stop and logout. Test fresh GPS on counterparty while screen off.
- This is a narrow lifecycle repair, NOT complete adaptive power optimization. Continuous iOS provider settings, network batching/backoff policy and unrelated app polling require measured follow-up; no arbitrary heartbeat reduction or auto-pause enabled here.

## PRE-FLIGHT — owner foreground-only decision
Owner explicitly requested implementation on 2026-10-17: app visible -> fresh GPS; minimized/locked -> no GPS. This supersedes the historical continuous-background canon for this temporary mode. Base 122a6659. Graphify AST-only updated before gated edits. Scope adds cancellable position capture, permission/disclosure and map-initialization deadline; no route/FSM/backend/schema/design-size changes. Risks: stale native registrations, logout restoration, late permission/watch callbacks, loss of background updates intentionally disclosed. Same rollback: revert isolated patch, no deploy/data mutation.

Foreground-only scope also covers the two remaining direct one-shot GPS callers (city picker and trip weather); both now use bounded cancellable capture. No card/font dimensions changed. Native route requests retain their existing timeout: the map remains interactive while route geometry loads.

## Current foreground-only candidate
- Runtime policy is foreground-only on iOS/Android: do not start native background registration; stop pre-existing registration on startup and on headless invocation. Background callbacks cannot append/send locations. Foreground grant is sufficient; no Always request.
- Fresh fix uses balanced accuracy, 8-second deadline, timestamp validation and removal of native watch on success, cancellation, lock/minimize and late subscription completion. The active-trip hook pauses timers and requests in background; reopen samples immediately. City picker and weather use the same bounded capture.
- MapKit initialization deadline is 8 seconds with an error/retry state and protection against late updates. This addresses indefinite JS initialization waiting; a native-thread hang on the owner's installed build is not yet reproduced or proven fixed.
- Four-language disclosures and map notices explain foreground-only operation, last position and update time. GPS disclosure scrolls at large font without changing font/card dimensions. Physical font1.6 acceptance remains pending.
- Current checks: full unit/frontend suite 1313/1313 PASS before the final native-cleanup-exception test; lint528 PASS and web export PASS before the final city/weather caller changes. Final rerun recorded below.
- Remaining acceptance: independent GPS/security review, CI at final SHA, physical iOS/Android upgrade/resume/lock/map tests and energy profiling. No claim about measured battery savings on the installed iPhone. Existing server heartbeat can still mark a signal lost after 20 minutes without points; intentional foreground-only silence is disclosed, and server policy is unchanged.
- No merge, production/store publication, device interaction or production backend change.

Final local rerun: unit/frontend **1314/1314 PASS**; lint **528 active JS files PASS**; web export/finalizer PASS; whitespace PASS. Physical phones and deployed app remain unchanged.
