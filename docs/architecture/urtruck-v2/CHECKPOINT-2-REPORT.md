# Foundation V2 Checkpoint 2 Report

Date: 2026-09-05

## Baseline and result

| Run | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---|
| Before runtime wiring | 0 | 0 | 0 | Collection interrupted by `test_chat_voice_transcription.py`: `no such table: drivers_registration` |
| After runtime wiring | 0 | 0 | 0 | Same collection error, no new failure identified |
| V2 focused suite | 10 | 0 | 0 | PASS |

The full suite cannot provide executed-test counts until the legacy collection-time DB reset is isolated. The test-only manifest is `backend/requirements-test.txt`; production continues to use `backend/requirements.txt`.

## Runtime adapters

With `DEALS_V2_ENABLED=false` (default), all legacy handlers remain active. With an explicit `true`, these existing URLs select V2 while retaining their URL and basic response shape:

- `POST /api/v1/market/bids`
- `PATCH /api/v1/market/bids/{bid_id}`
- `POST /api/v1/market/bids/{bid_id}/counter`
- `POST /api/v1/market/bids/{bid_id}/accept`
- `POST /api/v1/market/bids/{bid_id}/reject`
- `POST /api/v1/market/bids/{bid_id}/cancel`
- `PATCH /api/v1/market/deals/{deal_id}/status`

`PATCH /api/v1/market/trips/{trip_id}/status` remains legacy in this checkpoint and is an explicit bypass dependency. It must be adapted before enabling V2 for shared users.

## AcceptBid transaction

The adapter opens `BEGIN IMMEDIATE`. V2 validates actor, bid state, parent ownership/availability, and live-deal existence; conditionally claims cargo/trip; conditionally accepts the bid; rejects competing bids; inserts exactly one deal; inserts immutable `deal_transitions`; inserts `BidAccepted` and `DealCreated` into `domain_outbox`; stores the idempotency result; then commits. Any exception closes the connection with an uncommitted transaction and SQLite rolls it back.

## Invariants and constraints

- SQLite conditional updates reject stale bid/deal state.
- `BEGIN IMMEDIATE` serializes competing writers.
- V2 creates partial unique indexes for live deals by cargo and trip only after read-only duplicate preflight; duplicate legacy data raises `invariant_preflight_failed` and is not deleted.
- Idempotency keys are unique and payload fingerprints are compared.
- `deal_transitions` is append-only by application contract.
- Existing legacy tables are reused; no PostgreSQL, Redis, broker, or second database was added.

## Legacy writes still present

Legacy writes remain in `backend/api/marketplace.py` for the OFF path, including cargo/trip lifecycle, bid expiry and legacy bid actions, `_finalize_accept_inline`, `_transition_deal`, and `PATCH /trips/{trip_id}/status`. Push, Chat, timeline, GPS, and scheduler writes remain outside V2. No legacy code was deleted.

## Concurrency and worker evidence

The local file-backed SQLite harness ran 100 repeated accept-vs-accept races: zero duplicate live deals and zero half-states; p50 3.78 ms, p95 4.12 ms. The focused suite proves rollback when outbox insertion fails, idempotent replay/conflict, actor-gated FSM, and outbox process/retry state. Full accept/update/cancel/reject and crash-after-handler matrix remains a gate.

## Product decision required

Do not enable V2 in a shared or production-like environment until the missing fix branch is available and audited, `PATCH /trips/{trip_id}/status` is routed through the Deals owner, and the full backend suite has a reproducible baseline with the collection-time DB reset fixed.
