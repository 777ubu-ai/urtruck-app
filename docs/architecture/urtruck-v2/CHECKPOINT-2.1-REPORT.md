# Foundation V2 Checkpoint 2.1 Report

Date: 2026-09-05
Branch: `arch/urtruck-foundation-v2-0001`
Architecture baseline: `db3c46be805264b5e77b4684e8e40136af2262d7`

## Test environment and collection

Canonical test environment is Python 3.12 with `backend/requirements-test.txt` in `/tmp/urtruck-foundation-v2-pytest312`. Production requirements were not changed.

The collection failure root cause was import order: `backend/tests/test_chat_voice_transcription.py` imported `api.chat` at module collection time, while the shared test database and `drivers_registration` schema were initialized by the session fixture. Other module-level database resets made that ordering observable. The fix defers only the test module's API import until test execution. No skip and no production workaround were added.

Full backend result after the fix:

```text
426 collected; 333 passed; 93 failed; 0 skipped; 0 xfailed; 145 warnings; 7.20s
```

The 93 failing test node IDs are byte-for-byte the same as the comparable baseline run from `2aa0cdaf9b70341a5862d69d8eaabca72788f27d` with the collection-only fix applied: 416 collected, 323 passed, 93 failed, 0 skipped, 0 xfailed, 145 warnings, 7.07s. Therefore no new failure was introduced by Foundation V2. Failures are in the existing legacy suites: `test_border_dashboard` (2), `test_deal_country_guard` (7), `test_deal_status_actor_fsm` (25), `test_deal_weight_enrichment` (2), `test_idor_three_accounts` (14), `test_live_deal_push_lifecycle` (2), `test_market_dashboard` (2), `test_prerelease_hardening` (2), `test_publish_time` (2), `test_push_anonymous_ownership_guard` (3), `test_push_token_security` (11), `test_routing_router_mounted` (1), `test_self_bid_and_webhook_guard` (2), `test_social_auth` (4), `test_unread_badge` (8), and `test_unread_deduplication` (6). The exact node-ID list is unchanged between the two runs.

Focused Foundation V2 and architecture suite: `12 passed, 0 failed`.

## Runtime and REST evidence

With explicit `DEALS_V2_ENABLED=true`, the existing adapters were exercised through FastAPI `TestClient`:

- `POST /api/v1/market/bids`
- `PATCH /api/v1/market/bids/{bid_id}`
- `POST /api/v1/market/bids/{bid_id}/counter`
- `POST /api/v1/market/bids/{bid_id}/reject`
- `POST /api/v1/market/bids/{bid_id}/cancel`
- `POST /api/v1/market/bids/{bid_id}/accept`
- `PATCH /api/v1/market/deals/{deal_id}/status`

All exercised success responses were 200; outsider deal transition was 403; missing trip was 404. Accept replay with the same key returned the same deal ID. The accept response includes the legacy fields (`deal_id`, `chat_room_id`, route, parties, rejected siblings). With the flag omitted or set false, `deals_v2_enabled()` remains false and the legacy branch is selected.

## Concurrency matrix

Each scenario ran 100 iterations, with two concurrent operations per iteration. All post-run invariant queries passed: zero duplicate live deals, zero accepted-bid/deal amount mismatches, zero accepted bids without a live deal, zero live deals whose winning bid was cancelled/rejected, and zero half-states. There were zero SQLite locked errors.

| Race | Operations | Results over 100 runs |
|---|---|---|
| accept vs accept | 200 ops | 100 success, 100 conflict |
| accept vs update | 200 ops | 185 success, 15 conflict |
| accept vs cancel | 200 ops | 100 success, 100 conflict |
| accept vs reject | 200 ops | 100 success, 100 conflict |
| accept vs counter | 200 ops | 100 success, 100 conflict |
| counter vs reject | 200 ops | 124 success, 76 conflict |
| two bids / same cargo | 200 ops | 100 success, 100 conflict |
| two bids / same trip | 200 ops | 100 success, 100 conflict |
| repeated accept / same key | 200 ops | 200 idempotent success, 0 conflict |
| repeated accept / different keys | 200 ops | 100 success, 100 conflict |
| stale version mutation | 200 ops | 100 success, 100 conflict |

The SQLite write boundary is `BEGIN IMMEDIATE`; state changes also use conditional status/version updates and live-deal partial unique indexes.

## Trip bypass and country guard

`PATCH /api/v1/market/trips/{trip_id}/status` now routes through the Deals owner when V2 is explicitly enabled. Reactivating a trip with a live deal returns 409 `LIVE_DEAL_RESERVATION` and does not change the trip, bid, or deal. The old double-booking path is covered by `test_trip_status_cannot_reactivate_live_deal`.

Country guard evidence:

| Route | Transition | Result |
|---|---|---|
| KZ -> KZ | in_progress -> at_border | 409 `ROUTE_NOT_INTERNATIONAL` |
| KZ -> KZ | in_progress -> delivered | allowed |
| CN -> KZ | in_progress -> at_border | allowed |
| CN -> KZ | in_progress -> delivered | 409 `ROUTE_REQUIRES_BORDER_STEP` |
| unknown/NULL | in_progress -> at_border | 409 clarification |
| unknown/NULL | in_progress -> delivered | 409 clarification |

## Idempotency and outbox

Create, update, counter, reject, cancel, accept, and deal transition were exercised with same-key replay and conflicting-payload checks. Same operation and payload returned the stored result without a second mutation/event; a conflicting payload returned deterministic 409. The committed-transaction/lost-response boundary was covered by replay tests.

Accept mutation and `BidAccepted`/`DealCreated` outbox insertion share one transaction. An injected outbox failure rolled back bid, cargo, deal, transition, and outbox rows. The persistent worker covers claim, success, retry, exponential backoff, stale-claim recovery, and permanent failure.

Delivery semantics are **at-least-once plus idempotent consumers**, not exactly-once: a handler can perform an external side effect and crash before `processed_at`; after lease expiry the event is claimed again. The crash test demonstrates replay and consumer dedupe by `event_id`.

## Fix branch, legacy writes, decisions, risks

`git fetch origin fix/deals-bids-concurrency-20260905` returned `fatal: couldn't find remote ref`; the fix branch is **NOT AVAILABLE** and no diff was invented or merged. Foundation V2 uses only audited invariants in this worktree; integration remains a dependency.

Legacy writes remain in the OFF path, including `_finalize_accept_inline`, `_transition_deal`, legacy bid actions/expiry, cargo/trip lifecycle, price/timeline writes, and side-effect writes in Push/Chat/GPS/schedulers. V2 still reuses the existing tables and does not remove legacy code. No Chat, Push, Translation, Realtime, Redis, PostgreSQL, Documents, or GPS migration was started.

**PRODUCT DECISION REQUIRED:** do not enable V2 for shared users until the unavailable fix branch has an accepted baseline/diff review and the full legacy suite's 93 pre-existing failures are triaged. No merge, deploy, or default flag change was made.

Performance of the direct SQLite race harness: per-operation p50/p95 was approximately 1.2/2.5 ms across the matrix; stale-version was 0.17/0.41 ms. The gate does not claim production capacity. Remaining risks are legacy regression debt, unavailable fix-branch integration, and SQLite single-writer contention under production load.
