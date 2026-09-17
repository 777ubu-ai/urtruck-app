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
