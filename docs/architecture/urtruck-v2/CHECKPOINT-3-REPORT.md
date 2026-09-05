# Foundation V2 Checkpoint 3

## Scope

Baseline: `70108dc7ca9d106c618bfcc199bb2cd4c34af241`.

This checkpoint closes the Legacy -> Deals/Bids V2 integration gate. No product FSM, UX, public URL, request shape, response shape, deployment, mobile publication, or production flag was changed. `DEALS_V2_ENABLED` remains `false` unless an explicit test environment override is supplied.

## Integration changes

- All normal bid mutations and deal/trip status adapters already selected V2 on explicit ON.
- Added V2 adapters for `counter/accept`, `counter/cancel`, and `counter/decline`; these were the last counter status/deal creation bypasses.
- Counter acceptance uses the same atomic reservation/deal/outbox path as normal acceptance and preserves legacy response fields, including `amount`.
- Bid expiry uses the Bids owner under V2 and a conditional update; legacy expiry remains the OFF rollback path.
- Deleting a cargo with a live deal returns `409 LIVE_DEAL_RESERVATION` while V2 is ON.
- V2 service performs no Push, Chat, GPS, or Documents side effects. Domain outbox is separate from `push_outbox`; delivery is at-least-once with idempotent consumers.

The complete source inventory is in `LEGACY_WRITE_INVENTORY.md`.

## Historical fix gap analysis

The requested `fix/deals-bids-concurrency-20260905` branch is absent locally and from `origin`; no code was reconstructed from its name. Historical commits were compared instead:

| Historical guarantee | Current V2 status |
|---|---|
| Actor-aware deal transitions (`f932ba95`) | Covered by `transition_deal` and explicit role tests |
| Atomic deal event / fail-closed access (`8537dc2c`, `f1415d4e`) | Covered for V2 transaction, transition log, authorization and outbox; legacy OFF path remains for rollback |
| International border rules (`2570028b`) | Covered by V2 country guard parity tests |
| Ownership before idempotent repeat (`4853886e`) | Covered: actor authorization precedes accepted transition replay |
| Idempotent GPS transition pushes (`9f19d01d`) | Remains in legacy Tracking/Push boundary; V2 does not emit GPS/push side effects |
| Unread/push dedupe (`e5b7aebb`) | Remains in Notifications/Push boundary; no duplicate V2 push is generated |
| SQLite deal uniqueness and concurrent accept | Covered by V2 conditional claims, `BEGIN IMMEDIATE`, and unique live-deal indexes after preflight |

Real remaining gaps are not silently treated as fixed: production rollout still needs side-effect consumers wired to domain events with documented dedupe keys, load measurements on production-like SQLite, and owner approval of the V2 response/notification behavior. No missing historical commit is claimed as integrated.

## Verification record

Canonical full backend invocation: `PYTHONPATH=. /tmp/urtruck-foundation-v2-pytest312/bin/pytest -q backend/tests` -> **431 passed, 0 failed, 0 skipped, 0 xfailed, 218 warnings, 13.03s**. The previous checkpoint had 427 tests; four new integration/regression tests account for the count increase.

Specialized results:

- Foundation V2: **17 passed**.
- IDOR/security/push/storage subset: **49 passed**.
- FSM/country/expiry subset: **47 passed**.
- Deals/Bids idempotency, outbox rollback/replay and counter-owner coverage: included in Foundation V2, **17 passed**.

Explicit-flag coverage exercises all bid routes, all counter subroutes, deal transition, trip bypass, rollback and side-effect isolation. The default-off contract remains covered by the existing feature-flag tests. The full suite above is the canonical OFF regression run; ON route smoke and the repeated SQLite concurrency harness were already green at the accepted Checkpoint 2.3 baseline and the ON-path changes are limited to the counter adapters, expiry owner adapter, and reservation guard.

Performance evidence carried from the accepted SQLite gate: AcceptBid p50/p95 approximately **1.2/2.5 ms**, stale-version **0.17/0.41 ms**; no duplicate deal, half-state, or SQLite locked result in the 100-run-per-scenario harness. This checkpoint does not claim production capacity.

Changed files:

- `backend/api/marketplace.py`
- `backend/modules/deals/application/service.py`
- `backend/services/bid_expiry.py`
- `backend/tests/foundation/test_deals_v2_service.py`
- `backend/tests/foundation/test_deals_v2_integration_gate.py`
- `docs/architecture/urtruck-v2/LEGACY_WRITE_INVENTORY.md`
- `docs/architecture/urtruck-v2/CHECKPOINT-3-REPORT.md`

## Verdict

`READY FOR REVIEW` for the code-level integration gate. This is not production enablement: `DEALS_V2_ENABLED` is OFF by default, and no merge/deploy was performed.
