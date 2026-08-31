# URTRUCK — QA2 4-Phone Competitive Report

Date: 2026-08-31
Controller: Maxim / independent QA
Branch: `claude/qa2-4phone-20260831`
Commit: `0b9e72f8`
Package under test: `com.urtruck.app.qa2`

## Code Fixed Today

- Added QA actors for the 4-device run: Boris, Fedya, Armando, Berik.
- Added safe QA2-only deep-link login in `App.js`.
- Guarded QA login by runtime Android package: only `com.urtruck.app.qa2` accepts `qa-auth`.
- QA login uses already-issued session tokens only; `QA_AGENT_TOKEN` is never embedded in the app.
- Added immediate `push.autoRegister()` after QA login for device-token proof.
- Added Android `applicationId` override for local QA2 builds.
- Added GitHub Actions `application_id` input for QA2 APK builds.
- Added CI check that `google-services.json` contains the selected Android package.
- Added QA-only bargain depth gate via `URTRUCK_QA_BARGAIN_DEPTH_GATE`.
- Production/default accept flow remains allowed unless QA gate is explicitly enabled.
- Frontend bargain UI now disables accept only when backend explicitly returns `false`.
- Fixed/supporting UI areas from today's phone findings:
  - bottom menu visibility/safe-area handling;
  - burger notification badge filtering;
  - app icon badge count source;
  - deals/archive unread count behavior;
  - favorites refresh crash around `refreshingList`;
  - voice-message transcription visibility/contrast;
  - deal workspace chat/media/status refresh handling.

## Code Tests Run

- `./.venv-py312-test/bin/python -m pytest backend/tests/test_bid_actions.py -q`
  - PASS: 38 passed, 1 warning.
- `node --test tests/frontend/bargain_depth_contract.test.mjs`
  - PASS: 3 passed.
- `./.venv-py312-test/bin/python -m pytest backend/tests/test_bid_actions.py backend/tests/test_production_security_guards.py -q`
  - PASS: 44 passed, 1 warning.
- `./.venv-py312-test/bin/python -m pytest backend/tests/test_production_security_guards.py -q`
  - PASS: 6 passed, 1 warning.
- `node --check App.js`
  - PASS.
- `node --check qa/maestro/_lib/ensure-actor.js`
  - PASS.

## Backend Work

- Deployed backend changes to production host.
- Production health checked:
  - `/api/version` returned `version=1.0.50`.
- Created/verified QA actors through protected backend QA provisioning:
  - `agent-boris`
  - `agent-fedya`
  - `agent-armando`
  - `agent-berik`
- Session tokens were generated locally for ADB deep-link login and were not printed in the report.

## Device Matrix

| Agent | Device | Serial | Role | Language | Current State |
|---|---|---:|---|---|---|
| Boris | Huawei GRL-AL10 | `3DJ0224B04002582` | shipper | ZH | QA2 installed, but old build remains |
| Fedya | Xiaomi 25078RA3EY | `4PYDDI4DHIXS5DD6` | shipper | RU/QA | Latest local QA2 installed, QA login applied |
| Armando | OPPO PJB110 | `WGCA9PSGOFUOWC7D` | driver | RU | Latest local QA2 installed, QA login applied |
| Berik | Xiaomi 25078RA3EY | `BUA6JB99T465Q49X` | driver | RU | Latest local QA2 installed, QA login applied |

## Physical Device Checks

- ADB sees all 4 phones.
- Latest local QA2 APK installed successfully on:
  - Xiaomi #1 at `2026-08-31 16:10:27`;
  - OPPO at `2026-08-31 16:10:34`;
  - Xiaomi #2 at `2026-08-31 16:10:43`.
- Huawei still has QA2 `versionCode=9`, `versionName=1.0.7`, `lastUpdateTime=2026-08-31 00:34:21`.
- All four installed package signatures match `[51ed3f60]`.
- Huawei issue is not `SIGNATURE_MISMATCH`.
- Huawei install blocker is system Huawei/AppGallery security requiring Huawei ID password.

## QA Login Evidence

- QA deep-link login opened the correct package/activity on three updated devices:
  - Fedya/Xiaomi #1: `com.urtruck.app.qa2/com.urtruck.app.MainActivity`.
  - Armando/OPPO: `com.urtruck.app.qa2/com.urtruck.app.MainActivity`.
  - Berik/Xiaomi #2: `com.urtruck.app.qa2/com.urtruck.app.MainActivity`.
- UI screenshots/XML were captured under:
  - `qa/evidence/qa2_4device_20260831/`
- Fedya reached shipper UI.
- Armando and Berik reached driver feed UI.

## Push Findings

- On the three updated QA2 phones, QA login applied but `push.autoRegister()` returned `token_failed`.
- Local build-output guard failed:
  - no `google_app_id`;
  - no `gcm_defaultSenderId`.
- Root cause: local APK was built without `android/app/google-services.json`.
- GitHub secret `ANDROID_GOOGLE_SERVICES_JSON_BASE64` exists.
- GitHub Actions QA2 build was run:
  - run: `33386124659`
  - branch: `claude/qa2-4phone-20260831`
  - input: `application_id=com.urtruck.app.qa2`
- CI decoded the real Firebase secret and proved:
  - Firebase project: `urtruck-e722b`
  - packages present: `com.urtruck.app`
  - package missing: `com.urtruck.app.qa2`
- Therefore a push-capable QA2 APK cannot currently be built from the existing Firebase secret.

## 4-Phone Competitive Scenario

Status: BLOCKED.

Not eligible to start the final PASS run because two hard prerequisites are missing:

- all 4 phones must have the same new QA2 build;
- QA2 must be able to register real native push tokens.

The following required physical checks were not executed to PASS level:

- Boris creates cargo.
- Fedya creates second cargo.
- Armando and Berik bid simultaneously.
- Four independent bargain branches run with 5 price actions each.
- Winner creates exactly 1 accepted bid, 1 deal, 1 chat.
- Loser has no access to deal/chat/documents/GPS.
- Real system push after app background/force close.
- Deep-link tap opens exact cargo/bid/deal.
- Chat, documents, map, GPS, statuses, delivery, receipt, reviews, archive.

## Final Verdict

FINAL VERDICT: BLOCKED.

Blocking defects:

- P1: QA2 Android package `com.urtruck.app.qa2` has no Firebase Android client in the current GitHub Firebase secret, so real push-token registration cannot work for QA2.
- P1/BLOCKED: Huawei cannot be updated by ADB without completing Huawei ID security confirmation on the device.

PASS is not allowed until:

- Firebase project `urtruck-e722b` has an Android app/client for `com.urtruck.app.qa2`;
- `ANDROID_GOOGLE_SERVICES_JSON_BASE64` is updated to include that QA2 client;
- a new QA2 APK is built by GitHub Actions and installed on all 4 phones;
- Huawei accepts the same build;
- real push tokens and real system pushes are proven on all phones;
- the full 4-phone competitive run is completed with screenshots/logs.
