# Foundation V2 Checkpoint 2.3 Report

Date: 2026-09-05
Branch: `arch/urtruck-foundation-v2-0001`
Baseline: `329896a7e222fb81116d42d2e62c20709355bdc2`

## Status

**READY FOR REVIEW**

## Exact root causes and fixes

The remaining four failures from Checkpoint 2.2 were reproduced in canonical collection order and traced to state left by earlier modules:

| Failure | Previous state owner | Root cause | Fix |
|---|---|---|---|
| `border_dashboard::test_best_picks...` | `cgr/test_settings` | Reloaded `cgr.settings.cgr_settings` singleton stayed disabled after the module ended. | Reload settings and rebind `scoreboard_service.cgr_settings` at every module boundary. |
| `border_dashboard::test_countries...` | `cgr/test_settings` | Same stale CGR singleton caused the live scoreboard branch to be bypassed. | Same module-boundary singleton restoration. |
| `prerelease_hardening::test_unique_index_created` | `test_deal_attachment_upload` plus config reload in `prerelease_hardening` | Module-level `DB_PATH` mutation was later consumed by `importlib.reload(config)`, redirecting DAL calls to the attachment DB. | Collection hook pins module DB constants and `DB_PATH` before each test. |
| `prerelease_hardening::test_duplicate_bid_deal_rejected_by_db` | Same | The redirected attachment DB had no marketplace/deals schema, so the test built an empty insert column list. | Same canonical DB pin and deterministic invariant bootstrap. |

The earlier 92 auth/schema failures were caused by global FastAPI dependency capture and shared DB pollution. The audited test-only harness fix from history was integrated; no product assertions were weakened.

Regression coverage was added in `backend/tests/architecture/test_module_boundaries.py` for collection ordering, env pinning, CGR singleton restoration, and registration-state isolation.

## Test evidence

Canonical full backend invocation:

```text
427 passed, 0 failed, 0 skipped, 0 xfailed, 218 warnings, 13.01s
```

The count is 426 original backend tests plus one order-regression test.

Foundation V2 plus architecture:

```text
16 passed, 0 failed
```

IDOR/security:

```text
35 passed, 0 failed
```

FSM, country guard, and Foundation Deals/Bids evidence:

```text
47 passed, 0 failed
```

The prior Checkpoint 2.1 concurrency matrix remains recorded: 100 runs for each of 11 races, zero duplicate live deals, zero half-states, zero amount mismatches, and zero SQLite locked errors.

## Fix-branch history audit

`git fetch origin fix/deals-bids-concurrency-20260905` still returns `fatal: couldn't find remote ref`; no matching remote ref exists. Repository history contains Deals/Bids-related commits, including `fd4f51a9` for Foundation V2 and older independent FSM/concurrency hardening commits (`f932ba95`, `8537dc2c`, `f1415d4e`), but no commit can be proven to be the missing named fix branch. No business-logic work was recreated or merged by guesswork.

## Scope and blockers

`DEALS_V2_ENABLED` remains OFF by default. No merge to main, deploy, production enablement, or mobile publication was performed. Chat, Push, Translation, Tracking, Documents, Realtime, Redis, and PostgreSQL work was not started.

No remaining backend test blocker is present in the canonical invocation. Production rollout still requires owner acceptance of the unavailable fix-branch integration gate and separate review of legacy-to-V2 switching.
