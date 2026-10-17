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
