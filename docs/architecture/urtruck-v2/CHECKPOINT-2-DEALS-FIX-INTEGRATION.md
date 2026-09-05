# Checkpoint 2 Deals Fix Integration

| Legacy defect | Fix-branch solution | Foundation V2 solution | Test proving it | Status |
|---|---|---|---|---|
| Double accept can create duplicate live deals | Not available: `fix/deals-bids-concurrency-20260905` is absent locally and on `origin` | `BEGIN IMMEDIATE`, conditional status updates, preflight-guarded live-deal unique indexes | `test_accept_bid_commits_business_change_and_outbox`, repeated concurrency matrix pending | Implemented from audited invariant; fix-branch dependency open |
| Accept can race with bid mutation | Not available | Winning bid conditional update requires `pending`; stale mutation returns conflict | service tests plus repeated concurrency test pending | Implemented; full matrix pending |
| Deal FSM bypass through trip status endpoint | Not available | V2 deal transition is owner-gated and flag-controlled; trip endpoint remains legacy when flag OFF | FSM authorization tests; endpoint adapter test pending | V2 protected; legacy bypass remains OFF-path |
| Accepted bid/deal consistency | Not available | One SQLite transaction writes bid, reservations, deal, audit, and outbox | `test_outbox_failure_rolls_back_accept_bid` | Implemented in V2 service |

## Dependency decision

The requested fix branch could not be fetched: `fatal: couldn't find remote ref fix/deals-bids-concurrency-20260905`. No result from that agent is claimed. Before enabling V2 in any shared environment, re-audit this table against the accepted fix branch and run the full concurrency matrix.
