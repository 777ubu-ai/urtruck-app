# One-shot location and background idle — 17.10.2026

## PRE-FLIGHT
- Owner explicitly requested one fresh position on opening, then no GPS timer or movement tracking; background cancels capture. Latest screenshot: 14 min screen / 14 h 23 min background. Installed iOS source and exact energy cause UNKNOWN; not proof for this candidate.
- Branch fix/one-shot-location-idle-20261017; base 740e9030f7e7b7c038bbb9a46999db1d382fa682. Own worktree; PR559 and devices belong to another operator and remain untouched.
- Known-good: PR559 QA APK 211040111 / source2a988e5 has limited Android acceptance; does not prove new one-shot semantics or iOS energy savings.
- Scope: foreground GPS hook, polling lifecycle utility, app navigator, bottom-nav badge, unread hook, map/deal and legacy network-poll timers, four-language mode notices and related tests. Protect font/card/layout sizes, FSM/Auth/ownership/FIFO, production, recording safety timers, device data and other worktrees.
- Graphify AST-only: 11522 nodes /25515 edges. Read timer callers, AppState and subscription edges before edits. Owner's current explicit request authorizes this change; no background GPS re-enabled.
- Checks: single capture per open, no timer repeats, cancel/resume and stale queued ticks; current GPS/logout/FIFO/badge regressions, full unit, lint, web/native bundle as relevant. Physical battery/iOS pending.
- Rollback: revert this isolated commit; no deploy, database/schema/data/system setting changes.

## Changes and evidence
- Current foreground-only mode samples once per visible session/approved deal-set, removes the 25-second GPS repeat and duplicate active-event sample. Reopening samples again; capture remains cancellable with an 8-second deadline. Permission flow and server approval are preserved.
- Added foreground polling lifecycle: stops native JS intervals on inactive/background, refreshes on return, rejects stale queued ticks, prevents overlapping interval jobs, removes listeners on effect cleanup. Used by root dashboard, bottom badge, unread counter, deal workspace, Deals, map and legacy network polling screens.
- Removed the unused global store subscription that forced MainTabs rerenders. No font/card/layout/navigation destinations changed. Voice recording safety timers are deliberately unchanged; no recording is started by this patch.
- RU/EN/KK/ZH text now explicitly says location is captured once, then GPS stops.
- Tests: unit/frontend **1320/1320 PASS**; targeted GPS/badge/capture **26/26 PASS** before final helper coverage; final lifecycle/poll/badge targeted **19/19 PASS**. New tests execute actual polling lifecycle and unread-hook code, check background start/read events, timer removal, stale callbacks after resume, slow-request overlap and one-shot GPS/reopen.
- Lint **530 active JS files PASS**; web export/finalizer PASS; native Metro/Hermes JS export iOS+Android PASS; diff whitespace PASS. Native JS export is not an installed APK/IPA.
- Source-only audio audit: recorder resets allowsRecordingIOS after stop; expoAudioCompat maps omitted staysActiveInBackground to shouldPlayInBackground=false. This does not prove installed-device energy cause.

## Remaining acceptance
- Independent review and final-SHA CI, actual APK/IPA builds, physical lock/reopen/position and unplugged energy comparison pending. Installed iPhone source UNKNOWN. No claim of zero energy or measured energy improvement.
- Existing backend gps_lost watchdog still sees stale samples after 20 minutes; snapshots are not continuous tracking. Server policy/declarations need release review; no backend/schema/production config changed here.
- Initial requests already in flight may finish after backgrounding; the patch cancels GPS and prevents subsequent polling jobs. It does not promise to cancel every existing HTTP request, OS push handling or user-started recording.
- This new candidate supersedes the app source accepted in PR559; previous device PASS cannot be transferred. No merge, deployment, store upload, settings changes or data clearing performed.

## PRE-FLIGHT — map-only refinement, 18.10.2026
Owner explicitly requires automatic GPS only while the map is open, stopped on map close/blur, background and lock. Base app 4c4ebd3f (CI3/3 SUCCESS); that build was not installed on the owner iPhone. Graphify AST-only rebuilt before changes. Scope: move broadcast ownership from MainTabs to focused map entry points, hook enabled/abort lifecycle, Start trip capability check without automatic fix, cached-only weather, mode notices and related tests. Map layout/fonts, role permissions, FSM transitions, queue, manual explicitly requested one-shot share/city locate and production protected. Existing explicit manual location actions remain user-triggered and cancel on app background; this refinement concerns automatic location. No request to silently acquire a fix on app login. Rollback: revert this refinement in isolated PR560, no data/deploy changes.

## Map-only implementation and final local verification
- Removed app-wide automatic capture/dashboard tracking loop from MainTabs. Root only stops persisted legacy native registration on mount, background and unmount.
- Broadcast hook is disabled by default. Deal workspace enables it only for a focused map view, driver role and active trip. RouteMap card preview does not enable capture; its explicitly opened fullscreen map does. TrackTruck uses screen focus. Server /tracking/active still authorizes only assigned-driver active deals; requested map target intersects server approvals before capture.
- Closing/blur/background resets approved capture scope and aborts the watch. A changed deal target invalidates an old fix immediately, before async approval refresh. No 25-second repeat in foreground-only mode.
- Start-trip retains permission/provider/status checks but does not acquire or send a GPS fix in this mode. Weather reads last-known cache only; no sensor fallback. Explicit manual Share location/city Locate buttons remain user-requested bounded actions, not automatic tracking.
- Updated four-language notices and consent intro to explain one-time map capture rather than continuous movement tracking. No font/card/layout, FSM/Auth/backend/schema/store config changes.
- Final full unit/frontend **1328/1328 PASS**; lint **531 active JS files PASS**; web export/finalizer PASS; iOS+Android Metro/Hermes JS export PASS; whitespace PASS. Tests exercise map close/reopen, stale capture completion after close/target switch, real map-entry visibility predicates, no root capture, no weather sensor fallback, capability-only preflight preserving permission/provider failures, plus existing capture abort, FIFO/logout/badge and navigation suites.
- Prior CI for4c4ebd3f was3/3 SUCCESS; final map-only commit requires its own CI/review and new physical build. iPhone energy and Dynamic Island acceptance remain pending; zero battery use is not promised. Watchdog/store declarations remain release review items. No public release, production deploy, device interaction or data clearing.
