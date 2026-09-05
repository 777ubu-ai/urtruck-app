# Foundation V2 Checkpoint 2.2 Report

Date: 2026-09-05
Branch: `arch/urtruck-foundation-v2-0001`
Start SHA: `95959bd374a4ccc40933720f5db6ecfd3f5b1625`

## Result

**READY FOR REVIEW**

The named concurrency fix branch remains absent from origin. The legacy failures were independently triaged; no product assertion was weakened and no production code was changed to hide a test failure.

## Failure triage

The original combined-process result was 93 failures. The collection/import fix and canonical test environment reduced the comparable run to 92 failures. The historical harness fix `21a3d8b4f2564dcd2b176cdf5b1470c8c6d9e5ba` was audited and applied as test-only code.

Root causes:

| Class | Failures | Evidence | Classification |
|---|---:|---|---|
| Global auth dependency contamination | ~57 | Module-level tests overwrite `verification_gate.require_level`; FastAPI captures the first dependency closure. Harness resolver makes auth module-local and order-independent. | Test infrastructure, fixed |
| Shared DB/schema contamination | ~35 | Module-level setup and migration tests mutate/drop shared tables and leave duplicate deal rows. Harness restores schemas and removes only test duplicate pollution. | Test infrastructure, fixed |
| Local storage environment | 1 | `main.py` used `/home/ubuntu/...` when `ENV` was unset on macOS. Canonical pytest environment now sets `ENV=test`, `URTRUCK_ENV=test`. | Test infrastructure, fixed |
| Remaining order-sensitive CGR/index checks | 4 | `test_border_dashboard` and `test_prerelease_hardening` pass in isolated processes and also pass as a pair; the exact same four residual nodes are documented by historical harness commit `21a3d8b4`. | Test isolation residue, no product evidence |

The exact remaining node IDs are:

```text
backend/tests/test_border_dashboard.py::test_best_picks_freshest_lowest_and_excludes_stale_nodata
backend/tests/test_border_dashboard.py::test_countries_aggregate_honest
backend/tests/test_prerelease_hardening.py::test_unique_index_created
backend/tests/test_prerelease_hardening.py::test_duplicate_bid_deal_rejected_by_db
```

Every previously failing module was then run as a separate pytest process. All 15 modules other than the two residual modules passed; both residual modules also pass when isolated. Security/IDOR modules pass isolated, including `test_idor_three_accounts` (20 tests), `test_push_token_security` (11 tests), and `test_push_anonymous_ownership_guard` (3 tests). No genuine P0/P1 access-control regression was reproduced.

## Full suite evidence

Combined canonical run after the harness change:

```text
426 collected; 422 passed; 4 failed; 0 skipped; 0 xfailed; 218 warnings; 12.83s
```

Foundation V2 focused plus architecture suite:

```text
15 passed; 0 failed
```

The four remaining failures are not reproduced in isolated module runs. They require a deterministic per-module process/DB policy or a further owner-approved harness decision; no test was skipped or marked xfail.

## Fix branch and integration gate

`git fetch origin fix/deals-bids-concurrency-20260905` still returns `fatal: couldn't find remote ref`. No ref exists in `git show-ref`. Repository history contains the separate test-harness commit `21a3d8b4`, but no equivalent named Deals/Bids fix branch. It was not merged as a business fix. The applied harness commit is `2c8f4db4`.

## Scope and gate

No Chat, Push, Translation, Tracking, Documents, Realtime, Redis, PostgreSQL, merge, deploy, or production flag change was made. `DEALS_V2_ENABLED` remains OFF by default.

The branch is ready for review with four explicitly evidenced test-isolation residues. V2 rollout remains blocked until an owner accepts the canonical per-module test execution policy and the missing Deals/Bids fix branch or its stable integration baseline is available.
