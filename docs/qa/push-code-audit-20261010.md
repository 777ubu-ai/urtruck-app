# Push: source audit and automated regression, 2026-10-10

PRE-FLIGHT: branch feat/qa2-onesignal-pilot-20261009; tested source f3ac7bdacd4ba841baec71e3d9f053cbc376daab. Known-good: prior targeted production Huawei tests apply only to that installed binary. Scope: source inspection, isolated automated tests, read-only Android AVD and candidate replace-install; production runtime and data protected. Checks: frontend push/read/badge/OneSignal cases; backend source-of-truth, ownership, outbox and transport cases. Rollback: revert this report; terminate this audit's emulator/install processes; no account deletion, app uninstall or data clear.

This is the historical pre-implementation audit. For the subsequent source fixes and current acceptance limits, see [push-integration-20261010.md](push-integration-20261010.md).

## Results

| Check | Result | Evidence |
|---|---|---|
| 25 selected frontend test files | 141 passed, 0 failed | /private/tmp/urtruck-push-code-audit-20261010.tap on Mac |
| OneSignal isolated transport unit tests | 8 passed | /private/tmp/urtruck-push-backend-audit-20261010.log on Mac |
| 14 selected backend regression files | All 115 selected tests passed across initial run and targeted correction rerun | /private/tmp/urtruck-push-server-regression-20261010.log; corrected native contract group: 3 passed |
| Android AVD urwork_test | Booted Android 34 arm64 Google APIs; candidate install did not produce a verified success during this audit | Initially installed QA2 211040081, POST_NOTIFICATIONS granted; not new OneSignal acceptance |
| OPPO/Huawei new OneSignal physical acceptance | Not completed | Existing physical blockers in push-run-20261010.md |

Backend source was copied with git archive to /tmp/urtruck-push-code-audit-f3ac7bd on the server, outside runtime trees. Tests used separate temporary databases with APP_ENV/URTRUCK_ENV/ENV=test and the existing QA2 Python environment. No production DB or runtime patch. Initial backend run: 114 passed, 1 failed because the temporary copy omitted src/utils/push.js required by a cross-stack source contract. After copying that exact HEAD file, all 3 tests in that file passed; the initial failure was a harness omission, not a confirmed product defect. No unnecessary repetition of the 112 other passing tests.

## What source tests establish

Room-specific cleanup preserves other rooms and lifecycle notifications, excludes pushes arriving after the read request began, and guards account changes. Foreground policy, OneSignal custom payload parsing, click buffering/deeplink handling, dedup, stale badge responses, unread arithmetic and logout/ownership protections have automated coverage. Transport tests cover absolute iOS badge values including zero, targeted recipients, idempotency and truthful provider failures/retries. These are code-level results, not evidence of an OS banner, sound or OEM launcher behavior.

## Confirmed incompleteness

1. Backend OneSignalTransport is referenced by its own unit tests, but has no integration call sites in the current backend business-event dispatch. Device-to-account registry, logout lifecycle and durable outbox routing to OneSignal remain unfinished. SDK and transport unit PASS cannot establish end-to-end chat delivery.
2. NotificationsScreen.handlePress/readAll mark server records read and refresh badge, but do not call a targeted OS notification dismissal. Room-specific cleanup exists separately in readChatNotifications.js. Thus generic inbox read does not establish automatic removal of the matching system push. This is a confirmed missing code path; exact physical symptoms per provider remain to be reproduced.
3. Old Huawei QA2 211040106 lacks OneSignal native classes; it cannot be made into the native pilot by a server-only edit. Ready candidate 211040107 still requires normal device installation.

## Required follow-up

Implement a secure verified subscription/user binding with account lifecycle and a single provider per event/device; wire durable business events/outbox to OneSignal with retries and idempotency. Implement exact event/notification-to-OS-id correlation for targeted cleanup after confirmed read, preserving other notifications and newly arriving messages. Add integration tests exercising those actual call sites rather than only mocked transport/helpers. Then verify candidate on Android emulator, OPPO, Huawei and a signed QA2 iPhone build separately. Do not claim 10/10 before physical delivery, banner, tap, unread, icon badge and read cleanup evidence on each platform.

No application code was changed, no rebuild or public rollout was started by this audit.
