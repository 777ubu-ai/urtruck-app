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
