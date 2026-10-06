# Physical cross-device visibility diagnostic — 2026-10-06

## Pre-flight

- Branch/SHA: `fix/production-build84-country-catalog` / `5d7dca70a614fece721eb0bd6c5c956f53189238`.
- Known-good: **UNVERIFIED**. There is no accepted two-account cargo → bid → deal → room run for the installed artifact.
- Scope: read-only APK provenance, passive startup/endpoint observation, and static mapping of the visibility path. No source, backend, data, session, storage/cache, install, OTA, EAS/Play/store, deployment, key, or push change was made.
- Rollback: not applicable; no runtime state was changed. Any later source patch must be separate, minimal, Graphify-gated where required, and reverted with `git revert <commit>` if needed.

## Device lineage (redacted)

| Device | Android | Package/version | Installer | Installed / updated | Artifact verification |
| --- | --- | --- | --- | --- | --- |
| Huawei `3DJ…2582` (GRL-AL10) | 12 / API 31 | `com.urtruck.app` 1.0.9 / 213298108 | `com.gbox.android` | 2026-10-06 00:32:04 / same | base and three splits match the preserved local immutable copies |
| OPPO `WGCA…W C7D` (PJB110) | 14 / API 34 | `com.urtruck.app` 1.0.9 / 213298108 | `com.android.vending` | 2026-10-06 00:46:51 / same | base and three splits match the preserved local immutable copies |

Both devices reported the same hashes: base `78c0fa…eeb9b`; arm64 split `d0b90a…e2c79`; RU split `f9baae…bb55e`; xxhdpi split `066472…bfd87`. The base certificate digest is `4424ed…4fc4d`. The immutable artifact manifest reports the same package/version/target SDK, `expo.modules.updates.ENABLED=false`, and no embedded Expo Updates manifest entry. Its `assets/app.config` has build flavor `production` and API host `qa2.urtruck.kz` (endpoint recorded without credentials or account data).

Status: **PASS** only for identical installed-artifact lineage and native Updates-disabled evidence. This does **not** establish source provenance, active authentication, active role, actual request host, or cross-device visibility.

## Passive runtime attempt

| Device | Local device time | Result | Status |
| --- | --- | --- | --- |
| Huawei | 2026-10-06T13:44:16–13:44:21+05:00 | `MainActivity` start returned `Status: ok`, then was foreground. Fresh logcat yielded no safe host-only URL. | UNVERIFIED actual host |
| OPPO | 2026-10-06T13:44:20–13:44:25+05:00 | `MainActivity` start returned `Status: ok`; notification shade remained topmost. Fresh logcat yielded no safe host-only URL. | UNVERIFIED actual host and foreground state |

An earlier launch command was rejected before starting either application because Android returned a resolver metadata line before the component. It made no device-state change. No logcat was cleared; no raw log, UI hierarchy, screenshot, token, header, cookie, account identifier, message or payload was retained.

## Static request/filter evidence (current source SHA only)

- `src/config/env.js`: for native clients, `Constants.expoConfig.extra.urtruckApiUrl` overrides the build-time `EXPO_PUBLIC_API_URL`; the installed artifact therefore has a code-path to `https://qa2.urtruck.kz/api/v1`. This is **source/config-path evidence**, not proof of a live request.
- `src/utils/marketAPI.js`: cargo feed requests `GET /api/v1/market/cargos` with `status=active`, city/country/type filters, `limit=50`, `offset=0`; trip feed mirrors this with `GET /api/v1/market/trips`.
- `backend/api/marketplace.py`: public lists require `status=active`, apply optional route/type filters and pagination, and additionally remove non-public/dirty/expired records. `POST /cargos` is client-only; `POST /bids` on a cargo is driver-only; `/market/my` scopes cargo, bid, deal and room data to the authenticated user.
- `CargoFeedScreen.js` and `FeedScreen.js` remove only a viewer's own listings client-side before their local date/sort/filter view. No locale-specific client filter was found in this feed path.

Status: **PASS** for the stated source-path facts on this SHA; **UNVERIFIED** for every runtime predicate on the installed old APK/backend pair.

## Controlled-flow authorization

The owner confirmed separate QA2 accounts and roles on the visible devices and authorized creating a QA test cargo. Cleanup remains a separate reversible action and is not authorized in this run.

## Controlled two-account result

Owner-confirmed QA2 accounts were used: Huawei as a separate `client` and OPPO as a separate `driver`. A controlled QA-only cargo was then created on Huawei (route Иу → Алматы; тент; 10 t; 80 m³; 1,500 USD; date 2026-10-07; marker `QA2-E2E-20261006`). The Huawei UI confirmed publication and marked the cargo active.

The initial OPPO feed snapshot did not yet include the cargo. After an actual pull-to-refresh, OPPO displayed the exact marker and all matching route, capacity, price and date fields. Opening its detail screen also exposed the enabled driver-only `Предложить цену` action. No bid, deal, message, push, deletion, account change, source, store, deployment, key or OTA change was made.

Result: **PASS** for client → driver cargo publication, driver feed refresh, cross-device visibility, and opening the driver detail screen on the installed QA2-configured APK pair. The earlier snapshot is therefore insufficient evidence of a persistent visibility defect; it establishes only that an explicit refresh was needed in that observation.

## Current verdict

**NO-GO for production release remains.** The controlled QA2 visibility path now passes, but the installed production-package APK still embeds the QA2 endpoint. Its source lineage is unverified; there is no newly built and forensic-verified production AAB/APK, and the iOS, push, full bid → deal → room, GPS, store availability and remaining release gates are not closed.

## iPhone and production-artifact update — 2026-10-06

- Physical iPhone `iPhone Bah (2)` is paired/connected and booted: iPhone 15 Pro Max, iOS `27.0.1`, build `24A446`.
- Installed app: `com.urtruck.app`, version `1.0.9`, build `85`; process is present. TestFlight/source commit provenance is **UNVERIFIED**; this is not evidence of the new candidate's fix.
- Preserved CI AAB `qa/fixes/2026-10-06-audit-remediation/artifact-213392855/app-release.aab` was independently checked: SHA-256 `d0073702f51bdc01d013744f03ab686f17197e4eef3148b733c449a06d8331e3`; package `com.urtruck.app`; version `1.0.9`; versionCode `213392855`; embedded app config has production host `https://urtruck.kz`.
- The same AAB **FAILS the strict artifact gate** because its bundled `index.android.bundle` still contains one `qa2.urtruck.kz` literal. Context is the runtime allow-list string, not proof of a live QA2 request, but the TЗ requires absence of the QA2 host. Signing certificate is present; its stable SHA-256 digest is recorded in the prior audit evidence, not repeated here.
- This AAB is therefore **NOT ACCEPTED as the new production artifact**. Its recorded CI/source provenance belongs to the earlier audit candidate, not the current checkout `8804ec3aa1f79ad9c93feb40362a65f3f603b125`; no new signed AAB was built or uploaded in this pass.

## Current-checkout automatic checks

- Current checkout observed: `fix/production-build84-country-catalog` / `8804ec3aa1f79ad9c93feb40362a65f3f603b125`.
- `EXPO_PUBLIC_API_URL=https://urtruck.kz EXPO_PUBLIC_IS_BETA=false URTRUCK_BUILD_FLAVOR=production npm run release:check-config`: **PASS** (native config parity; Android config versionCode source default remains 9 before CI monotonic override).
- `node --test tests/frontend/test_chat_scroll_metrics.mjs tests/frontend/rc1_deal_fsm_static.mjs`: **PASS 8/8**; the incomplete scroll-event and deal-FSM guards pass on this checkout.
- No source/product files were changed in these checks; only the existing untracked evidence files remain.

## iPhone USB physical smoke — 2026-10-06

- USB/CoreDevice connection: **PASS**. iPhone 15 Pro Max was controlled through macOS iPhone Mirroring; no reinstall, logout, storage clear, permission change or account mutation was performed.
- Profile/role screen: current installed account visibly resolves to a driver profile; account provenance and QA/test status are **UNVERIFIED**, so no business-mutating actions were taken.
- Deals list: **PASS (read-only)**. Existing deal list loaded; active deal room opened and message history loaded without a blank composer or crash.
- Chat scroll/background smoke: **PASS (limited)**. Composer focus remained available, history scrolled, app was sent to Home and relaunched through `devicectl`; the same deal room and history returned. No message was typed into a sent payload and no message was submitted.
- iPhone map: **FAIL**. At approximately 16:10 local time, the deal map view showed `Карта недоступна`; expanding the map produced a blank map surface, `—` for distance/remaining/ETA/GPS metrics, and no visible Retry action. Returning to chat worked. This is physical evidence on the installed iOS build 85; provider/backend root cause is **UNVERIFIED**.
- Crash evidence: no UrTruck crash report appeared in the filtered system crash list after this smoke. The older Jetsam snapshot contains a UrTruck process entry but does not attribute an app crash or termination; status is **NOT REPRODUCED**, not PASS for a new candidate.
- Push, bid/deal mutation, GPS start/permission, network-offline recovery and lock-screen notification were **NOT TESTED/BLOCKED** because the visible iPhone account/deal was not proven to be the designated disposable QA entity and those steps would create business events or change deal state.

## Latest controlled deal run — 2026-10-06 14:56–15:03 +05:00

- Roles used were the previously confirmed separate QA2 accounts: Huawei as `client`, OPPO as `driver`. The existing controlled cargo marker was `QA2-E2E-20261006`; no additional cargo was created.
- OPPO sent exactly one offer for **$1,450**. The OPPO cargo page changed to `1 предложение`.
- Huawei displayed the same offer in `Предложения`: marker `QA2-E2E-20261006`, driver label `Zavod Zavod`, amount `$1,450`. The explicit confirmation dialog was accepted once.
- Huawei confirmed `Сделка создана · 1450`. OPPO then showed the same cargo with current status `Принят` and deal price `$1,450`.
- Both devices opened the same deal chat. OPPO sent the exact control message `QA2 E2E driver message`; Huawei displayed that exact message. This is physical evidence for cargo → offer → acceptance → one deal → one room → driver-to-client text delivery on the installed QA2-configured Android APK pair.
- Immediately after the client attempted to type a reply, Huawei reproduced the old P1: `TypeError: Cannot read property 'contentSize' of null` in `DealWorkspaceScreenV2` (bundle offset `1:1464470`). The error boundary repeatedly reappeared after relaunch. This is a **physical FAIL** of the installed APK, not an inference. It prevented the reply-direction chat check, background/foreground push acceptance and GPS flow.
- Push: **NOT TESTED / not proven**. Notification icons/badges were not attributed to this deal, so they are not evidence of UrTruck push delivery.
- GPS: **NOT TESTED** because the client app fails before a reliable active-deal run.
- iPhone 15 Pro Max remains connected (UrTruck 1.0.9 build 85), but TestFlight provenance and interactive iPhone flow are still **UNVERIFIED**; no iPhone action is claimed here.
- Current source contains the null-safe scroll handler; its focused scroll/FSM tests pass. The installed Android APK predates that source, so this run cannot validate the fix.

## Artifact recovery status

- Commit `2111b0a7` removes the complete dormant QA2 hostname from production-bundle source paths while preserving runtime QA2 allow-list behaviour, and strengthens the build-only artifact gate to reject any `qa2.urtruck.kz` literal.
- Focused checks: share contract **3/3 PASS**, scroll/FSM **8/8 PASS**, production config PASS, and exported production web bundle contains no `qa2.urtruck.kz` literal.
- The branch was pushed. A build-only workflow dispatch was attempted but GitHub rejected it because the workflow is not yet present on the repository default branch. No signed AAB, Play upload, rollout, deployment, key or production mutation was created by that attempt.

## Current verdict

**NO-GO.** The core Android QA2 deal path is now physically reproduced through one delivered chat message, but the installed APK has a confirmed P1 crash in the deal workspace. New production AAB verification, iPhone, push and GPS remain open and must be re-run on a newly signed fixed build.

## Urgent Android ↔ iPhone follow-up — 2026-10-06

### Play Console read-only check

Play Console opened in the UrTruck developer account. The account reports that publishing applications is currently unavailable until identity and phone verification are completed. No app list, track, version, staged rollout or halt state can be read back from this account. Therefore rollout status is **BLOCKED/UNAVAILABLE**, not evidence that a public rollout exists; no rollout mutation was attempted.

### P1 source remediation and regression checks

- Pre-flight source SHA: `62a2a7fe3dcdb5142b94aa1bfd404af71cb9dcd4`, branch `fix/production-build84-country-catalog`; scope limited to the existing DealWorkspace composer handler and its regression test.
- The remaining crash path was confirmed at `DealWorkspaceScreenV2`: `onContentSizeChange` dereferenced `event.nativeEvent.contentSize.height` directly. It now reads `event?.nativeEvent?.contentSize?.height`; a missing native measurement preserves the last trusted composer height through `stableComposerHeight`.
- Added regression coverage for `null`, missing `nativeEvent`, missing `contentSize`, missing `height`, unchanged-text measurement stability and source-level absence of the unsafe dereference.
- Focused result: **46/46 PASS** (`test_chat_scroll_metrics`, `test_deal_workspace`, `test_deal_chat_composer_visibility`, `test_qa2_chat_media_p1`).
- This fix is source-level only until a newly built, signed Android/iOS candidate is installed. The old Android APK that physically reproduced the P1 remains a pre-fix artifact; no claim of physical fix is made.

### iPhone map and cross-device flow status

- The connected iPhone 15 Pro Max build 85 still has the previously recorded physical map **FAIL** (`Карта недоступна`, blank expanded map, no distance/ETA/GPS and no Retry). Static native code has explicit fail-closed branches for missing MapKit module/key and failed Yandex initialization; the runtime provider/key/route/coordinate state on build 85 is not observable from the current physical tooling, so root cause remains **UNVERIFIED**.
- No new disposable iPhone QA deal marker was created. The visible iPhone account/deal is not proven disposable QA, so bid/deal mutation, reply-direction chat, push, GPS start and offline retry remain **BLOCKED/NOT TESTED**.

## Updated verdict

**NO-GO / BLOCKED for physical acceptance.** The P1 source fix and focused regressions pass, but a new signed candidate has not been installed on Android or iPhone; Play rollout data is unavailable; the iPhone map failure is unresolved; and the full disposable Android ↔ iPhone bid/deal/room/chat/push/GPS run is not closed.

## Unified acceptance follow-up — 2026-10-06

### Android QA2 candidate forensic result

- GitHub Actions run `37456452316` completed **successfully** from full source SHA `f0055af9b2ee8611f59566a4c219fa2ca3a50940`.
- Artifact `UrTruck.apk`: SHA-256 `f373059fa9aa66501c2e9cba9875d02a655de45ac117d89b91afade3e560da73`.
- Manifest: package `com.urtruck.app.qa2` (isolated from production data), version `1.0.9-qa2`, versionCode `211040101`, target/compile SDK 36.
- Embedded config classifies as QA2 (`qa2.urtruck.kz`); no production endpoint was selected. The bundle has no literal `qa2.urtruck.kz`/`urtruck.kz` host string because the runtime endpoint is carried through the resolved app config. Native MapKit payload is present (`libmaps-mobile.so` for all four ABIs); the CI gate confirmed the protected MapKit variable was non-empty without exposing its value.
- Signature: one signer, SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, QA debug certificate. This is an internal QA-only artifact and is **not** a production/Play candidate.

### Physical installation gate

- Huawei `3DJ0224B04002582`: `adb install -r` reached Huawei security review, then required the Huawei ID password. No password was entered; installation was cancelled. `com.urtruck.app.qa2` is not installed.
- OPPO `WGCA9PSGOFUOWC7D`: OEM security scan remained on the install-review screen; both the direct install and shell `pm install` did not complete. No package data was changed and `com.urtruck.app.qa2` is not installed.
- Existing production package `com.urtruck.app` was not overwritten on either device.

### iPhone candidate/provenance and map evidence

- Physical iPhone remains `com.urtruck.app`, version `1.0.9`, build `85`. App Store Connect read-back shows only build 85 attached to iOS version 1.0.9; no source SHA or relation to `f0055af9` is exposed. Therefore build 85 is **NOT ACCEPTED as the fixed candidate**.
- On build 85, opening the existing deal map visibly rendered `Карта недоступна`; the expanded surface was blank and all route/GPS metrics were `—`. Source mapping shows this copy belongs to the native provider-not-configured branch, but the old binary does not expose whether the underlying cause is missing `NativeModules.yamap` or a missing/invalid key. Exact next technical step: install the QA2/TestFlight candidate built from the approved SHA with protected MapKit variables, then capture the runtime module/key-presence booleans and provider/route state before opening the map.

### Remaining physical acceptance

No new marker `QA2-IOS-ANDROID-FINAL-20261006` was created because neither the isolated Android candidate nor an iPhone candidate was installable/verified, and the current iPhone account is not proven disposable QA. Bid/deal mutation, two-way chat, push/badge, map PASS and GPS remain **NOT TESTED/BLOCKED**.

### Owner action required to continue without weakening gates

1. On Huawei/OPPO, approve the OEM security review using the device's normal trusted installation path (Huawei requires the device owner to complete the Huawei ID prompt; OPPO requires its security-review completion). No password or OTP should be sent in chat.
2. Promote/merge `f0055af9` into the protected `qa2/integration-candidate` ancestry, then dispatch `UrTruck QA2 TestFlight` with confirmation `BUILD_QA2_TESTFLIGHT` and the full SHA. The workflow already requires the protected QA2 API, APNs and MapKit variables and submits only to internal TestFlight; it does not release to the App Store.

## Unified acceptance verdict

**NO-GO / BLOCKED.** Source P1 fix and automated regressions pass; the new Android QA2 artifact is forensic-valid but not physically installed; iPhone build 85 is not proven to contain the fix and still fails the map smoke; the full Android ↔ iPhone deal, push and GPS matrix is therefore not accepted.
