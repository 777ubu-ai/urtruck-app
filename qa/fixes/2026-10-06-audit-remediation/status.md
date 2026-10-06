# Audit remediation status — 2026-10-06

## Pre-flight

- Branch/base SHA: `fix/production-build84-country-catalog` / `1f167f7440d32e7e3134797227baf92aadde8c5c`.
- Production deployed SHA: UNVERIFIED.  No production, store, OTA, key or user-data mutation was performed.
- Scope: Android production/QA2 configuration, Play workflow validation, and the Deal workspace scroll handler.  FSM, navigation, backend, push keys and iOS UI are protected.
- Rollback: revert the remediation commit; installed device data and artifacts remain untouched.

## Findings and evidence

| Finding | Status | Evidence / result |
| --- | --- | --- |
| `com.urtruck.app` 213298108 provenance | PARTIAL | Huawei `3DJ0224B04002582` (Android 12, installer `com.gbox.android`, installed 2026-10-06 00:32:04) and OPPO `WGCA9PSGOFUOWC7D` (Android 14, installer `com.android.vending`, installed 00:46:51) have identical base/splits. Base SHA-256 `78c0fa6875af256f739a8d571d0da61768d52ee4b93f9f3a26168386d06eeb9b`; Google Play app-signing certificate SHA-256 `4424ed7c5650c9a569fcc6b55220767c3a7434f0d7c249b9c95ad9b1ec94fc4d`. |
| Embedded environment | FAIL (original artifact) | Extracted `assets/app.config`: package `com.urtruck.app`, version `1.0.9`, flavor `production`, API `https://qa2.urtruck.kz`. Native manifest has Expo Updates disabled; no downloaded OTA can explain this APK. Raw APK/splits are preserved locally under `device-lineage/installed-213298108/` and are intentionally not staged. Source SHA and actual network traffic remain UNVERIFIED/NOT TESTED. |
| Configuration guard | PASS (source) | Every non-QA2 config now pins `https://urtruck.kz` and rejects a non-production override; explicit QA2 still requires a non-production endpoint and its isolated package. The build workflow resolves and asserts the final Expo config before Gradle. |
| `DealWorkspaceScreenV2` crash | PASS (source robustness); BLOCKED (physical attribution) | The on-scroll handler now ignores incomplete metrics and retains last valid state. `chatScrollMetrics` regression covers null/missing, valid near-bottom values and synchronous extraction. Exact old APK stack/source map and physical retest are unavailable. |
| Play run `37364500967` | FAIL (historical run); PARTIAL (workflow fix) | Read-only GitHub log: source `1f167f…`, AAB SHA `d0073702…`, production API, then `track=production`, `status=halted`, no `userFraction`; upload failed before edit commit. Workflow now requires explicit valid fraction for staged statuses and records upload request/outcome separately. No store job was run. Upload-existing-artifact and protected public-rollout workflows remain NOT IMPLEMENTED. |
| Security | PASS (compensating control) | `source-map-js` is pinned by root override to fixed `1.2.2` (GHSA-68fv-2mgg-jv7q range is `<1.2.2`) without changing Expo/RN. `audit:node-forge-exception` now passes: the remaining five high audit records are only the reviewed node-forge chain, and the checked local patch plus exploit regression pass. This compensates the node-forge advisory; it does not remove the upstream npm record. |

## Checks

- Focused frontend regressions/config contracts: 51/51 PASS.
- `npm run lint`: PASS (454 active JS files).
- `npm run release:check-config`: PASS.
- `git diff --check`: PASS.
- Security gate: PASS; `source-map-js@1.2.2` override verified by `npm ls`, security gate and exploit regression.
- `npm run build:web`: PASS after the lockfile update.

## Blocked prerequisites / next step

1. Obtain the exact 213392855 AAB workflow artifact (GitHub artifact download stalled locally), then inspect manifest/config/signature and compare its SHA to `d0073702…`.
2. Provide exact crash stack/source map and QA accounts; perform physical Android scroll, API-host, push and full-deal acceptance. iPhone soft-wrap remains BLOCKED without a device.
3. Implement and dry-validate a separate upload-existing-artifact workflow with lineage/read-back, then a protected public-rollout action.

## Verdict

**NO-GO.** Remaining P0/P1 blockers: physical environment/config acceptance, crash attribution/retest, push/full flow acceptance, missing release-artifact lineage and protected rollout workflow. No build, upload, OTA or public rollout is authorized by this status.
