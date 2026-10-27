# QA2 TestFlight 1.0.13 recovery — 2026-10-27

## PRE-FLIGHT

- Branch/SHA: `fix/qa2-testflight-1.0.13-20261027`, based on QA2 integration candidate `0071a4e1733ad4a42855a6836b201c25c1dd48f7` (PR #623).
- Known-good: iPhone currently has UrTruck `1.0.12 (114)`; the previous QA2 TestFlight candidate `1.0.12 (115)` was uploaded but rejected by Apple because the approved `1.0.12` pre-release train is closed (`90186`, `90062`). Huawei QA2 uses `qa2.urtruck.kz`.
- Scope: only the protected QA2 TestFlight workflow marketing version and this evidence note.
- Protected: committed production `app.json` version (`1.0.12`), App Store release workflows, production API/data, and QA2 backend data/configuration.
- Checks: PR quality-gate checks; after merge, the protected TestFlight workflow must build an IPA with `CFBundleShortVersionString=1.0.13`, a build number above 115, and embedded API host `qa2.urtruck.kz` before submitting to Apple.
- Rollback: revert the workflow-only version bump through a PR. No server or database mutation is part of this change.

## Result

Apple's error is caused by reusing the already approved App Store version `1.0.12`; changing only the build number cannot reopen that train. The QA2 TestFlight workflow now prepares a runner-only iOS candidate at `1.0.13`. The committed app/store version remains unchanged. The next TestFlight build number must exceed the rejected build 115.

## Status

- Source change prepared; PR/CI/TestFlight submission pending.
- Production unchanged.
