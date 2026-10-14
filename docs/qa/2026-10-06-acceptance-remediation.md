# UrTruck remediation and acceptance checkpoint — 2026-10-06

Release verdict: **NO-GO; local remediation verified, physical acceptance pending.**

## Source and scope

- Base: `qa2/integration-candidate` at `442a0ddc49566435c9e88e50dbf65b83a2c57b25`.
- Isolated worktree: `/tmp/urtruck-acceptance-20261006`.
- Branch: `fix/qa2-acceptance-20261006`.
- Implementation SHA: `8b1f33b10baf6fda132fda13b6020de10a1616de`.
- Main worktree and its untracked audit/fix folders were preserved.
- No protected branch merge, production deployment, store upload, native CI build, phone installation or external business mutation was performed in this session.
- Local backend uses a new disposable test database; no production/QA2 database was used for the browser deal test.

## Changes and their limits

| Area | Implemented and verified locally | Still required |
|---|---|---|
| Chat crash | Guard the additional unsafe FlatList onScroll callback; preserve last reliable state on null, incomplete or nonfinite metrics | Repeat the exact OPPO/Huawei failure on a new installed candidate with stack/build evidence |
| Profile save | Show localized PHONE_CHANGE_OTP_REQUIRED, PHONE_ALREADY_IN_USE, MESSENGER_CONTACT_REQUIRED, ROLE_ALREADY_SET, auth and rate-limit errors; preserve entered data and actual HTTP status | Confirm the original account-specific failure with runtime response; complete native profile flows |
| OTP onboarding | Reproduced success token/session with UI stuck on OTP. Preserve navigator across guest → verified without role; cold incomplete session starts at RoleV2 | Physical Android/iOS replay; native Google/Apple flows |
| Native map | Clear rejected initialization cache, expose Retry after transient initialization failure; safe presence/state diagnostics | Capture native module/key/provider state on new iOS binary. Build 85 map root cause remains UNVERIFIED |
| Environment | Restore missing production endpoint pin/rejection from prior remediation; production resolves https://urtruck.kz, QA2 requires explicit separate API | Inspect signed candidate config/runtime host; old installed production APK remains unrepaired |
| Dependencies | source-map-js 1.2.1 → 1.2.2 only; Expo/RN unchanged | Existing node-forge compensation is still required; raw npm audit is not clean |
| Play workflow | Validate explicit fraction for halted/inProgress; no fabricated fallback; default draft; distinguish upload requested from actual step outcome | Real upload/read-back and protected upload-existing-artifact/public rollout workflow remain NOT VERIFIED/NOT IMPLEMENTED |
| Flags | Integrate approved -20% diameter change from 389152ee; preserve current citizenship UI and touch targets | Native visual review on all relevant screens |
| QA2 identity | Advance versionCode to 211040102 above observed Huawei QA2 build 211040101 | Build, verify artifact/signature and install as update |

## Validation

| Check | Result | Evidence |
|---|---|---|
| Full frontend unit | 967/967 PASS, 0 skipped | `/tmp/urtruck-unit-final-20261006.log` |
| Lint | PASS, 450 active JS files | `/tmp/urtruck-lint-final-20261006.log` |
| Config gate | PASS; native config parity only, not binary provenance | `/tmp/urtruck-config-final-20261006.log` |
| Web export | PASS | `/tmp/urtruck-web-final-20261006.log` |
| Backend canonical isolated suite | Exit 0; 1049 pytest cases across 125 modules plus test_public_filter.py script | `/tmp/urtruck-backend-suite-20261006.log` |
| Workflow static checks after YAML edit | 16/16 PASS | `/tmp/urtruck-workflow-static-20261006.log` |
| Security compensation gate | PASS with existing verified node-forge patch; source-map-js advisory removed | `/tmp/urtruck-security-gate-20261006.log` |
| Registration browser UI | 8/8 PASS, desktop 1440px and narrow 393px, mocked API | `/tmp/urtruck-profile-e2e-20261006.log` |
| Real local deal/browser chat | PASS: cargo → bid → accept → exact actor's deal → driver message → shipper reply → history after reload; two isolated contexts | `/tmp/urtruck-deal-e2e-20261006.log` |
| Runtime navigation browser regression | 2/2 PASS: both roles, Feed/Deals/Profile, dark/light | `/tmp/urtruck-runtime-e2e-20261006.log` |
| Final metadata/config focused regression | 17/17 PASS after versionCode-only change | `/tmp/urtruck-candidate-metadata-20261006.log` |
| Whitespace check | git diff --check PASS | Local git |

The full frontend run precedes only the final two-value QA2 metadata bump; its affected config/build suite was run again afterward. Backend source did not change. The workflow static suite was repeated after its YAML change. Local browser backend/API success is not evidence of APNs/FCM delivery, launcher badge, native MapKit or background GPS.

Before fixes, executable callback regressions failed for partial scroll events and retrying rejected MapKit initialization. The new browser onboarding regression failed on the real compiled UI even though the mocked OTP response issued a token and the app saved a session; it passes after the navigation fix. Known-error UI tests exercise the real profile callback and regAPI implementation rather than duplicating their decisions in a mock helper.

Raw npm audit still reports five high advisory entries associated with the node-forge chain. The existing repository gate verifies the patched node-forge payload and its exploit regression, and accepts only its existing documented exception. This patch did not add a new exception, disable security gates or mass-upgrade dependencies.

## Physical read-back at checkpoint

| Device | Current observation | New candidate acceptance |
|---|---|---|
| OPPO PJB110 | `adb devices`: unauthorized; earlier in this session connected with production com.urtruck.app 1.0.9 / 213298108 and no QA2 package | BLOCKED; no new APK installed |
| Huawei | Not listed by adb in this session | BLOCKED; no new APK installed |
| iPhone Bah (2), iPhone 15 Pro Max | devicectl: available (paired); earlier connected | BLOCKED; no new iOS candidate installed |

Earlier audit statements about installed QA2 versionCode 211040101, build 85 map failure, old production APK endpoint and push in one direction are historical evidence. They are not retested PASS on this branch.

## Outstanding A–Z acceptance

- New APK/IPA provenance: exact SHA, package/bundle, versions, API host, signing identity, SHA-256 and native MapKit/key presence.
- Install candidates and finish native registration for client and driver without bypassing OTP/role/verification rules.
- New marked QA2 cargo, visibility and filtering in both directions; capture cargo_id, bid_id, deal_id and room_id.
- Bid/accept, both native chat directions, large history/scroll, failed-send retry and foreground/background return.
- Android ↔ Android and Android ↔ iPhone push: foreground in-app, background/locked phone notification, launcher badge and deep-link; server event/outbox/receipt traces. OEM badge support must be recorded rather than inferred.
- Map and route/ETA recovery; location permission denied/granted paths; driver GPS start, background updates and peer display.
- Authorized deal lifecycle through delivered/completed/cancelled cases and role permissions.
- Attachments, voice, reconnect/offline behavior, localization and cross-platform visual review.
- Store/TestFlight read-back, new production AAB, rollout isolation and protected artifact promotion remain pending.

## Continuation and rollback

1. Review this PR against qa2/integration-candidate and complete mandatory CI. Previous authorization to merge PR #470 does not prove a merge of this new PR.
2. On an approved source, build internal QA2 artifacts through the existing exact-SHA workflows. Do not use the bootstrap/deploy workflow named build-android-qa2.yml as an APK build.
3. Restore OPPO USB debugging authorization, connect Huawei/iPhone, verify installed candidate identity and run the marked physical flow.
4. Fix each demonstrated failure and rerun its acceptance segment; never carry a prior binary's PASS to a different artifact.
5. Public production rollout requires its own concrete approval and verified artifact/store read-back.

All implementation commits are isolated and individually revertible. Main/protected branches are unchanged. Revert the relevant PR commit on a review branch if its candidate shows a regression; do not uninstall QA apps or remove accounts/databases to hide a failure. AST dependency evidence was retained at `/tmp/urtruck-graphify-evidence-20261006` outside git.
