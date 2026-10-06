# Three-device physical acceptance status — 2026-10-06

## Scope and safety

- Source under review: `fix/production-build84-country-catalog` / `5d7dca70a614fece721eb0bd6c5c956f53189238`.
- No source/product change, device data change, login/logout, test entity, permission grant, screenshot, video, install, OTA, Play/TestFlight/App Store upload, rollout or deployment was performed in this pass.
- Existing untracked audit/evidence files are preserved. APK/AAB binaries remain untracked.

## Physical-device pre-flight

| Device | OS | Installed app | Role / separate QA2 account | Status |
| --- | --- | --- | --- | --- |
| iPhone 15 Pro Max | iOS 27.0.1 | `com.urtruck.app` 1.0.9, build 85 | UNVERIFIED | BLOCKED pending owner confirmation and TestFlight/source provenance |
| OPPO PJB110 | Android 14 / API 34 | `com.urtruck.app` 1.0.9, versionCode 213298108 | UNVERIFIED | BLOCKED pending owner confirmation |
| Huawei GRL-AL10 | Android 12 / API 31 | `com.urtruck.app` 1.0.9, versionCode 213298108 | UNVERIFIED | BLOCKED pending owner confirmation |

The installed Android artifact is not a candidate for the current source: it embeds the QA2 endpoint and predates the requested acceptance candidate. No account name, phone, token, message, credential, screenshot or private payload was retained.

## Existing production AAB artifact (static evidence only)

Artifact: `artifact-213392855/app-release.aab` (not staged).

| Check | Result |
| --- | --- |
| SHA-256 | `d0073702…d8331e3` |
| Package / version | `com.urtruck.app` / 1.0.9 |
| Manifest versionCode | 213392855, greater than 213298108 |
| Embedded app config | flavor `production`; API `https://urtruck.kz` |
| Bundle literal scan | production host found; no QA2 host literal found in the JS bundle |
| AAB signing certificate | `BB:24:74:…:E7:CB:88:B4` (upload certificate, not independently proven Google Play app-signing certificate) |
| Native update evidence | app config present; no Expo Updates asset/manifest entry observed |
| Workflow provenance | GitHub run `37364500967`, SHA `1f167f7440d32e7e3134797227baf92aadde8c5c`, ended `failure`; evidence says its artifact was produced before the upload step failed |

Status: **PASS** for the enumerated static properties of this existing AAB. **UNVERIFIED** for Google Play signing, device installation, live endpoint, and physical behavior. It is **not** the current `5d7dca70` candidate: source diff after its SHA touches `app.config.js`, `src/utils/chatScrollMetrics.js`, `DealWorkspaceScreenV2.js`, and Play workflow behavior.

## Current source checks

| Check | Result |
| --- | --- |
| Resolved production Expo config with explicit production env | PASS: `com.urtruck.app`, flavor `production`, API `https://urtruck.kz` |
| `npm run release:check-config` | PASS with `EXPO_PUBLIC_IS_BETA=false` |
| `test_chat_scroll_metrics.mjs` | PASS 3/3: incomplete native events ignored; valid near-bottom decisions retained; event values read synchronously |
| Current signed production AAB | BLOCKED: no local non-debug upload keystore or upload-key environment material is available. The Gradle release target fails closed rather than silently creating a debug-signed artifact. |

## Physical acceptance gate

Before any entity-creating action, the owner must confirm without identifiers that iPhone is a separate QA2 `client`, OPPO is a separate QA2 `driver`, and Huawei is a separate QA2 `client`; current roles and filters must then be recorded from the UI. Controlled cargo markers will use `QA2-ACCEPT-YYYYMMDD-HHMM` and remain undeleted pending a separately approved cleanup plan.

## Verdicts at this point

1. **QA2 functional verdict:** BLOCKED — no role-confirmed three-device controlled flow has begun.
2. **Production artifact verdict:** PARTIAL — existing AAB static config PASS, current-SHA signed AAB BLOCKED.
3. **Store rollout verdict:** NO-GO — no upload/read-back/manual approval attempted.

## Superseding physical run — 2026-10-06 14:56–15:03 +05:00

This run supersedes the blocked acceptance state above for the Huawei/OPPO pair.

| Gate | Result | Physical evidence |
| --- | --- | --- |
| Separate-role visibility | PASS | Existing Huawei-client cargo `QA2-E2E-20261006` was visible on OPPO-driver after refresh. |
| One driver offer | PASS | OPPO sent one $1,450 offer; Huawei showed the exact marker, driver label and amount. |
| Acceptance / deal | PASS | Huawei explicit confirmation accepted once; Huawei showed `Сделка создана · 1450`, OPPO showed `Принят`. |
| Same room / OPPO → Huawei text | PASS | Both opened the deal chat; Huawei displayed exact OPPO message `QA2 E2E driver message`. |
| Huawei reply / reverse text | FAIL | Old installed Huawei APK crashed before reply. |
| Crash attribution | FAIL (confirmed) | `Cannot read property 'contentSize' of null` in `DealWorkspaceScreenV2`, bundle `1:1464470`; error returns after relaunch. |
| Push | NOT TESTED | No device notification was attributable to this test deal. |
| GPS | NOT TESTED | Cannot obtain a reliable active-deal client session after the crash. |
| iPhone 15 Pro Max | UNVERIFIED | Device/build 85 is connected; no interactive test or TestFlight provenance evidence. |

## New build status

- Source fix exists and is covered by scroll/FSM checks (8/8 PASS), but this physical run was on the old APK and does not validate it.
- Commit `2111b0a7` removes the dormant QA2 hostname literal from production-bundle source paths; focused share checks 3/3 PASS, production config PASS, production web-bundle literal scan PASS.
- The branch is pushed. The build-only workflow could not be dispatched because GitHub requires its workflow file to be present on the default branch. No signed AAB or Store mutation was produced.

## Updated verdicts

1. **QA2 functional verdict:** PARTIAL — visibility, bid, accept, deal, common chat and one direction of text PASS; reverse text blocked by confirmed old-APK P1.
2. **Production artifact verdict:** BLOCKED — current-source signed AAB has not been built/forensically checked.
3. **Store rollout verdict:** NO-GO.


## 2026-10-06 — OPPO map recheck

Physical test on OPPO (WGCA9PSGOFUOWC7D) in the existing QA2 deal:
- opened the deal header action `deal-header-map`;
- UI tree confirmed `deal-map-fullscreen` and `truck-map-yandex-mapkit`;
- map showed endpoints Иу and Алматы and route metric 4935 км;
- logcat was cleared immediately before the action; the post-action filtered log contained no UrTruck/MapKit fatal or exception.

Result: **PASS for map-open/render on OPPO Android old QA2 APK only**. It does not prove Huawei or iPhone, and it does not prove GPS tracking or push delivery.