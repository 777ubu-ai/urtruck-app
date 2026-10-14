# Dependency audit remediation — 2026-10-14

## PRE-FLIGHT

- Branch: `fix/npm-audit-tooling-20261014`.
- Base: PR #533 head `b0a047d9bb3b2582a7d4638adbf92e07b0631e82`;
  PR #533 base `main` was `1bc6d87b4e634eb6394930bfa45d5f9398b2a7fa`.
- Known-good: PR #533 CI `38610856875` had backend and mandatory web E2E
  passing, but stopped at npm audit. Full QA run `38610857016` passed.
  Same-base audit success `38612876198` used a vetted dependency fix; its
  unrelated payment features are excluded here.
- Scope: npm transitive dependencies, their audit gate, provenance/regression
  checks and this report. No app source, native project, Expo/RN version,
  release workflow, backend code, or store data is changed.
- Protected artifacts: iOS 1.0.9 (99), IPA SHA-256
  `886c68c0548089210f02406637ef4255686fa7be21dfdd834cd4318a16a611ca`, and
  Android 1.0.9 (`214116271`), AAB SHA-256
  `03500f2861ed6d07f20dc9d71f388d42438a589b046396bd393861718fe138da`;
  both remain associated with app source
  `9ac0b6200e1e91aa40b99cd1f4943062e2acc048`.
- Checks: clean `npm ci`, raw production/full-tree audit under the narrowly
  compensated `node-forge` gate, vendored upstream check, security regressions,
  YAML parse, and `git diff --check`. Remote required CI and exact-diff Security
  Review remain required before merge.
- Rollback: revert only this dependency/tooling commit. No runtime data or
  store artifact rollback is involved.

## Finding and dependency paths

PR #533's audit failure was caused by its unchanged lockfile: `shell-quote`
1.10.0 (critical GHSA-pqg4-j6r4-53mv), `source-map-js` 1.2.1 (high
GHSA-68fv-2mgg-jv7q), `braces` 3.0.3 (high GHSA-vfj7-8cjw-p6xm), and the
already patched `node-forge` 1.4.0 (one advisory represented by five
transitive high-severity entries). The breaking `npm audit fix --force`
recommendation would downgrade Expo to 44.0.6 and is rejected.

- `shell-quote`: only dependency parent is `react-devtools-core`, reached from
  React Native. Its only source import is in React Native's `__DEV__`-guarded
  React DevTools setup. Lock now resolves to 1.12.0; a regression asserts that
  a newline after a comment token is rejected.
- `source-map-js`: dependency parent is PostCSS. Lock now resolves to 1.2.2,
  the first version outside the advisory range. This is build-time source-map
  processing.
- `braces`: dependency path is Expo Metro file-map → micromatch → braces. No
  official npm fix is available (`braces` latest is 3.0.3). A temporary local
  3.0.4-compatible package is sourced from exact upstream PR #72 head
  `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`, including the later fractional
  depth, cycle handling, and stringify compatibility fixes. Hash manifest,
  SBOM, upstream-head monitor, and depth/cycle/compatibility regressions pin it.
- `node-forge`: remains 1.4.0 because no official replacement is available.
  Its exact patch hash is checked with a bounded expiry and exploit
  regression. The audit gate permits only that exact advisory/version/patch
  chain; any additional finding fails.
- A file-scoped `.gitattributes` rule preserves the unified-diff blank-context
  line required by `patch-package`; ordinary code whitespace checks remain on.

The source tree contains no direct imports of these packages. Expo/RN versions
remain unchanged. Existing IPA/AAB were not rebuilt, uploaded, or re-identified.
They are not certified against any later app-source changes by this report.

## Local validation

- `npm ci`: PASS; 676 packages installed, npm still reports the five `node-forge`
  advisory-chain entries handled by the exact gate.
- `npm run audit:node-forge-exception`: PASS; both `--omit=dev` and full-tree
  raw reports contain no finding outside the verified `node-forge` exception.
- `npm run security:check-braces-upstream`: PASS at check time; npm latest is
  3.0.3, upstream PR head is the pinned commit and is unmerged.
- `node --test tests/security/*.test.mjs`: 17/17 PASS.
- Workflow YAML and `git diff --check`: PASS.

Remote CI, independent exact-diff Security Review, and final PR identifiers
will be recorded after they complete; no earlier SHA's result is carried over.
