# npm audit triage — Track A

Baseline and post-install audit were run against the Expo SDK 52 dependency
graph. Counts: 46 vulnerabilities when using `npm audit --omit=dev`, and 47
when including dev dependencies. No `npm audit fix --force` was run.

| Package | Severity | Direct/transitive | Surface | Chain / installed scope | Safe action | Status |
|---|---:|---|---|---|---|---|
| `shell-quote` | critical | transitive | build/dev | Expo/Metro tooling | Upgrade only with compatible Expo CLI graph | deferred; no runtime import found |
| `tar` | critical | transitive | install/build | Expo CLI → cacache/tar | Upgrade via compatible Expo patch or isolated npm override after CI validation | deferred; force fix is breaking |
| `@xmldom/xmldom` | high | transitive | build/dev | Expo plist tooling | Upgrade with Expo-compatible patch | deferred |
| `form-data` | high | transitive | runtime/build unknown | HTTP/multipart dependency chain | Trace `npm explain form-data`; patch only if compatible | deferred |
| `image-size` | high | transitive | build/dev | Metro asset pipeline | Upgrade with React Native/Metro compatibility test | deferred |
| `postcss` | high | transitive | build/dev | Expo web tooling | Upgrade through Expo-supported graph | deferred |
| `ws` | high | transitive | dev/build | Metro/dev middleware | Upgrade through Expo-supported graph | deferred |
| `undici` | high | transitive | dev/build | npm/Expo tooling | Upgrade through compatible npm/Expo graph | deferred |
| `js-yaml` | high | transitive | dev/build | config tooling | Upgrade through compatible toolchain | deferred |
| `brace-expansion` | high | transitive | dev/build | glob tooling | Upgrade through compatible toolchain | deferred |
| `ajv`, `uuid`, `decode-uri-component` | moderate | transitive | dev/build | navigation/Expo tooling | Upgrade only with dependency graph validation | deferred |

The installed production application does not directly import these packages;
the audit is dominated by Expo/Metro/build tooling. This does not prove zero
reachability, so the release remains blocked until a supported Expo/RN upgrade
plan or audited overrides are validated in CI.

## Update 2026-10-14 — exact Expo 57 dependency graph

This dated result supersedes the older Expo 52 package/version table above.
PR #533 head `b0a047d9bb3b2582a7d4638adbf92e07b0631e82` failed CI run
`38610856875` at the npm audit step only. Its package manifest and lockfile
were unchanged from base `1bc6d87b4e634eb6394930bfa45d5f9398b2a7fa`.
The failed graph contained:

| Finding | Installed version | Advisory / dependency path | Resolution |
|---|---:|---|---|
| `shell-quote` critical | 1.10.0 | GHSA-pqg4-j6r4-53mv; `react-native → react-devtools-core → shell-quote` | Update lock to compatible 1.12.0; use is confined to React DevTools and guarded by React Native `__DEV__`. |
| `source-map-js` high | 1.2.1 | GHSA-68fv-2mgg-jv7q; `postcss → source-map-js` | Update lock to compatible 1.2.2; build-time source-map processing. |
| `braces` high | 3.0.3 | GHSA-vfj7-8cjw-p6xm; `@expo/metro-file-map → micromatch → braces` | Vendor the exact reviewed upstream PR #72 head `28d440b5dd449dbf1fe6f3506cf94ecca4d02660` as a temporary 3.0.4-compatible distribution. CI verifies provenance, regression boundaries, and fails when upstream publishes or merges a replacement. |
| `node-forge` high (five transitive entries) | 1.4.0 | GHSA-86w9-cpqp-85rv; Expo code-signing chain | Retain only the hash-verified upstream patch `f3e83351dc92090ce21f339420699316bebc4d128ad3e5ff19d1f55988653c47`; gate validates the exact advisory, version, patch, expiry and exploit regression, and rejects all other audit findings. |

Successful same-base CI run `38612876198` on `c12701ed74fe1bb5e37eed8168c707a8433d5d4d`
resolved `shell-quote` to 1.11.0, `source-map-js` to 1.2.2, used the vetted
`braces` source, and carried the same narrow `node-forge` compensation. The
current remediation refreshes the vendored `braces` source to the later exact
upstream PR head because the old head changed before this fix was prepared.

Source searches found no app import of these packages. `shell-quote` is only a
transitive React DevTools dependency; React Native's importing module is behind
`__DEV__`. `braces` and `source-map-js` are in Metro/file-map and PostCSS build
paths. No Expo/RN version, app source, native project, `app.json`, or store
artifact is changed by this remediation. IPA 99 and AAB 214116271 remain tied
to app source `9ac0b6200e1e91aa40b99cd1f4943062e2acc048`; neither was rebuilt.

Remediation branch `fix/npm-audit-tooling-20261014` is stacked on PR #533's
exact head. Local install and targeted regressions pass; the final remote CI
and independent review are recorded in the release checkpoint, not inferred
from the earlier successful run.
