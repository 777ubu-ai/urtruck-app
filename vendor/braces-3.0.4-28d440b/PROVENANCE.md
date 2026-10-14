# Vetted `braces` distribution

This directory is a source-vendored distribution for the temporary absence of
an upstream patched npm release for CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm.

## Source and identity

- Upstream repository: `https://github.com/micromatch/braces`
- Exact upstream commit: `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`
- Upstream base: `braces@3.0.3`
- Upstream commit title: `fix: limit nesting depth to prevent stack overflow`
- License: MIT; the unmodified upstream `LICENSE` is retained in this directory.
- License SHA-256: `35bdd8a44339719441900fb50fbefc5e2dca1ca662cbaed7a687de842c8b70f2`

The runtime source files are copied from that exact, closed-but-unmerged upstream PR head. It includes the depth cap, consistent fractional `maxDepth` handling, cycle-safe parent traversal, and stringify compatibility fixes. The distribution manifest differs only in non-runtime packaging metadata: its version is `3.0.4`, and upstream `scripts`, `devDependencies`, and `verb` metadata are removed. The version allows dependants constrained to `^3.0.3` to resolve the
vetted package while remaining outside the advisory's affected range; removing
test-only metadata prevents an npm `file:` link from importing obsolete test
dependencies into UrTruck's full dependency tree. It is not represented as an
upstream release.

`UPSTREAM-SOURCE-SHA256SUMS` records every copied source file. The ordered
manifest digest is `588c8cf853f59072989fb90289e697067ce76ac8056c9596b9721e49840ac9d3`.
The source-only `lib/` diff from upstream `3.0.3` to the exact commit has
SHA-256 `8293e87a8e3c5693446915953073f6eb95986b0f97d89a3ccf430842618449f5`.

## Removal plan

This is temporary. `scripts/security-check-braces-upstream.mjs` fails when npm
publishes a version newer than `3.0.3` or upstream PR #72 is merged. At that
point, remove this directory and its direct `file:` dependency, update the
lockfile to the official release, and rerun all audits and the Quality Gate.

Do not update this directory manually, source it from a different fork, or
change its package version without a new security review.
