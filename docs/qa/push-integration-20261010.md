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

The source implementation is saved as 29df526298ac3caffe9fee2f536c499cd0ef1ee8. Six selected push backend files from this SHA were deployed to QA2; this is not a full-product deployment SHA or a phone installation claim. A compiled signed QA2 candidate and per-device delivery/banner/tap/unread/badge/read-cleanup runs remain required. Huawei normal replacement previously waits for Huawei ID; OPPO is USB-visible but not ADB-visible. iPhone production build 96 is not a verified signed QA2 OneSignal build. Do not substitute code tests or provider acceptance for physical delivery. Never promise guaranteed delivery after force-stop or offline operation.

Historical audit gaps 1 and 2 in push-code-audit-20261010.md are addressed by this source implementation. Historical phone/install limitations remain open. Universal 10/10 is not established.


## QA2 runtime connection

Preflight compared the six affected runtime files to base 8f65c6b. Four existing files matched exactly. OneSignal transport was absent. The only notifications.py difference was its older URL-read helper without read-through parameters; the current source restores those compatible optional safeguards. No unrelated runtime edits were overwritten.

The systemd API reads /home/ubuntu/urtruck-qa2/.env; the previously saved OneSignal key was only in backend/.env. The existing QA2 credential was copied internally into the actual service environment; provider/app gating was enabled there. No secret was printed. ENV=qa, DB/storage paths and unrelated settings were preserved. URTRUCK_ENV=qa2 selects the explicit pilot guard.

Backup: /home/ubuntu/urtruck-qa2/backups/push-29df526-20261010T014243Z. Protected copies include affected old source, both env files and a consistent SQLite backup. Only urtruck-qa2.service was restarted. New registry columns verified; QA2 and production health both HTTP 200. Existing outbox scheduler has a fresh heartbeat. Unauthenticated pilot registration HTTP 401. Authenticated OneSignal app read returned HTTP 200 and the expected app; messageable_players=0, verified pilot registry rows=0. These establish server readiness, not a delivered phone push.

Runtime evidence: /private/tmp/urtruck-push-qa2-deploy-20261010.log and /private/tmp/urtruck-push-qa2-runtime-smoke-20261010.log.

Android QA2 build started once: https://github.com/777ubu-ai/urtruck-app/actions/runs/38013992483; exact native source 29df526, version 211040108. This workflow has no Play submission/public rollout. Compile result/artifact identity will be recorded separately.

Server-only channel follow-up: select existing_android_channel_id=urtruck_messages_v2, the channel already created by the native registration flow, so OneSignal uses the same approved high-importance channel. This does not alter or bypass user notification preferences. Reference: https://documentation.onesignal.com/reference/push-notification. This backend-only addition does not require a duplicate Android build; candidate 29df526 already creates that channel. Targeted provider/registry tests: 19 passed, 0 failed; /private/tmp/urtruck-push-channel-regression-20261010.log.


## Wider CI durable-event contract

GitHub CI frontend/lint/build passed on 0d809bf. Backend CI exposed one existing durable-chat test that explicitly expected a retry to send after the driver had opened/read the room. That expectation would re-create the cleared notification and is incompatible with the requested read-cleanup behavior. The test now asserts terminal skipped_read, zero provider calls on subsequent drain, and successful delivery of a genuinely new message. Full durable-event file: 12 passed, 0 failed in isolated SQLite; /private/tmp/urtruck-push-durable-regression-20261010.log. The CI push selector also explicitly includes onesignal so the new provider/registry tests become blocking future regressions. No application logic was relaxed to satisfy the old expectation.

Server-only channel follow-up 0d809bf was deployed after the guarded initial patch: existing provider file matched SHA 29df526 before replacement, its previous contents are preserved in the same protected backup directory, only QA2 API restarted and health HTTP 200. Evidence: /private/tmp/urtruck-push-channel-deploy-20261010.log.

## Final build and CI evidence

Full GitHub PR quality gate on 719439e4f62a2be375fe06da762b211bd6dfa5a7 succeeded: backend tests, frontend tests/lint/build and mandatory web E2E subset. Run: https://github.com/777ubu-ai/urtruck-app/actions/runs/38014832872.

Android workflow 38013992483 succeeded. APK downloaded once and verified: package com.urtruck.app.qa2, version 1.0.9-qa2 / 211040108, QA2 API host, exact OneSignal app ID in assets/app.config, native SDK and React Native bridge in DEX, one FCM intent action and the custom messaging service. Certificate SHA-256: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. APK SHA-256: 17e8666f0c13fd8eb09d84aa38d7fea6311318a1c6153eb1aa64ed8e8f198c71. Native source is 29df526; later commits contain server-only and test/CI/documentation changes. This is not an installed phone version or a Play/App Store publication.

The standalone OneSignal transport test file now has a unittest entry point; its independent invocation executed 13 tests successfully. This prevents an isolated runner from silently invoking the file without executing its unittest cases.

An extra canonical backend attempt from a git archive was blocked by tests requiring .git metadata (break-glass workflow guard). It does not establish a full server canonical PASS; the real-checkout GitHub backend quality gate above passed.

Physical acceptance remains open: Huawei last verified installed QA2 211040106 with replacement awaiting Huawei ID; OPPO USB-visible but absent from ADB; iPhone production 96 is not a verified signed QA2 OneSignal candidate. QA2 has zero verified pilot device bindings and zero messageable OneSignal recipients at the latest runtime check. No new OneSignal physical delivery, banner, tap, badge reset or read-cleanup PASS is claimed. Overall 10/10 remains unconfirmed.
