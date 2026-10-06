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
