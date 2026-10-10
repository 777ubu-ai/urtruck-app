# UrTruck: verified OneSignal routing and confirmed-read cleanup — 2026-10-10

## PRE-FLIGHT

Branch: feat/qa2-onesignal-pilot-20261009. Base commit: 8f65c6b. This report accompanies the implementation commit; its exact SHA is provided by GitHub commit/PR history. Known-good source audit: f3ac7bd; prior physical Huawei production checks belong to that installed binary only. Prior QA2 artifact: 211040107, source c2e61b45. Scope: push registry, verified QA2 transport, outbox, read acknowledgement and targeted OS cleanup; no country/flag design, AI translation/voice, GPS, business statuses or production configuration changes. Rollback: revert implementation commit; install only a higher-version replacement if required; no uninstall or data clearing. No public release.

## Implemented

- QA2 client obtains OneSignal subscription ID, OneSignal user ID and native token only from an opted-in SDK subscription. Both QA2 flavor and exact QA2 API host are required. SDK user/subscription changes trigger the existing coalesced registration path.
- Authenticated server registration verifies that exact subscription, app, platform, native token and permission through OneSignal View User. Client aliases alone cannot bind an account. Existing token ownership, logout tombstones and transactional registration fences remain enforced. Rotated pilot registry rows for the same device/account are retired.
- Verified QA2 devices select exactly one transport. Provider errors or missing configuration cannot silently fall back to direct FCM/APNs. Production/native non-pilot rows retain the existing transport.
- Legacy business-event wrapper enqueues an event before starting the daemon sender. Existing outbox retries use stable per-event/per-subscription idempotency and per-device delivery logs; remaining TTL is forwarded and current canonical unread badge is recomputed at retry time.
- Generic push data carries notification/event correlation when a single owned record can be identified. Ambiguous records are not guessed.
- Server single/read-all endpoints return confirmed owned IDs/event keys. Client dismisses only matching system notifications after acknowledgement; unknown records, other rooms, newer arrivals and switched accounts are protected. OneSignal Android removal also marks SDK records dismissed.
- An already-read correlated notification is suppressed before provider dispatch and becomes terminal skipped_read in the retry worker; it cannot be re-created by that queued retry.
- OneSignal receives an absolute server badge, including zero, for iOS and in custom data for Android. Android FCM handler reads the bounded custom JSON payload in addition to the original native badge. Actual OEM/SDK ordering still requires device acceptance.
- Next Android QA2 version code: 211040108. This is a new source candidate; installed 106 and previously built 107 do not include these changes.

## Validation

| Check | Result |
|---|---|
| Full frontend/unit regression | 1170 passed, 0 failed |
| Backend push/notification suites, isolated source and SQLite | 133 passed, 0 failed |
| Active JavaScript parse/lint | 495 files passed |
| Python source compilation | Passed for changed API/service files |
| Graphify dependency update after edits | 10909 nodes, 24034 edges, 582 communities; completed |
| Physical OPPO/Huawei/iPhone OneSignal acceptance | Not completed; no physical PASS claimed |

Backend tests ran in /tmp/urtruck-push-integration-20261010 outside runtime trees, with APP_ENV/URTRUCK_ENV/ENV=test and isolated databases. Unit fixtures use synthetic credentials; no real provider sends. New runtime tests cover verified registration, token mismatch, ownership conflict, exactly one provider, no fallback, owned read acknowledgement, read retry suppression, durable enqueue before daemon startup. Frontend tests cover production isolation, opt-out, metadata binding, exact OS cleanup, newer arrivals, unknown IDs, malformed confirmation and account switch.

Initial server run: 129 passed and one stale static expectation failed because legacy send now forwards copied/enriched data plus a durable event ID. That contract was updated to assert the preserved business arguments and enqueue-before-thread ordering; new runtime tests cover the behavior. Final full selected run: 133 passed. No unrelated assertion was removed.

Evidence on connected Mac:
- /private/tmp/urtruck-push-integration-js-20261010.log
- /private/tmp/urtruck-push-integration-backend-20261010.log
- /private/tmp/urtruck-push-integration-graphify-20261010.log

Reproduce frontend: node --experimental-loader ./tests/frontend/loader.mjs --test tests/frontend/*.mjs tests/unit/*.mjs; node scripts/lint-source.mjs. Backend: isolated DB and pytest test_onesignal_transport, test_onesignal_registry_integration plus the fourteen regression files listed in push-code-audit-20261010.md.

## Remaining acceptance

This change is saved source, not a claim of deployed backend or installed phone versions. A compiled signed QA2 candidate, QA2 backend deployment and per-device delivery/banner/tap/unread/badge/read-cleanup runs remain required. Huawei normal replacement previously waits for Huawei ID; OPPO is USB-visible but not ADB-visible. iPhone production build 96 is not a verified signed QA2 OneSignal build. Do not substitute code tests or provider acceptance for physical delivery. Never promise guaranteed delivery after force-stop or offline operation.

Historical audit gaps 1 and 2 in push-code-audit-20261010.md are addressed by this source implementation. Historical phone/install limitations remain open. Universal 10/10 is not established.
