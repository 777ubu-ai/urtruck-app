# Vetted `braces` distribution

This directory is a source-vendored distribution for the temporary absence of
an upstream patched npm release for CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm.

## Source and identity

- Upstream repository: `https://github.com/micromatch/braces`
- Exact upstream commit: `d0d575e55e74a4e0218e5248fafb79efc3e54ebb`
- Upstream base: `braces@3.0.3`
- Upstream commit title: `fix: limit nesting depth to prevent stack overflow`
- License: MIT; the unmodified upstream `LICENSE` is retained in this directory.
- License SHA-256: `35bdd8a44339719441900fb50fbefc5e2dca1ca662cbaed7a687de842c8b70f2`

The runtime source files are copied from that exact commit. The distribution
manifest differs only in non-runtime packaging metadata: its version is
`3.0.4`, and upstream `scripts`, `devDependencies`, and `verb` metadata are
removed. The version allows dependants constrained to `^3.0.3` to resolve the
vetted package while remaining outside the advisory's affected range; removing
test-only metadata prevents an npm `file:` link from importing obsolete test
dependencies into UrTruck's full dependency tree. It is not represented as an
upstream release.

`UPSTREAM-SOURCE-SHA256SUMS` records every copied source file. The ordered
manifest digest is `2c341159f8f3cdab843945e2e831ce6590f2a09f0910c324d30e36903cd6957d`.
The source-only `lib/` diff from upstream `3.0.3` to the exact commit has
SHA-256 `00e1924112c0b7242265fc0ee215e538d964b0bae0111cae8a815fb2a8165a78`.

## Removal plan

This is temporary. `scripts/security-check-braces-upstream.mjs` fails when npm
publishes a version newer than `3.0.3` or upstream PR #72 is merged. At that
point, remove this directory and its direct `file:` dependency, update the
lockfile to the official release, and rerun all audits and the Quality Gate.

Do not update this directory manually, source it from a different fork, or
change its package version without a new security review.
