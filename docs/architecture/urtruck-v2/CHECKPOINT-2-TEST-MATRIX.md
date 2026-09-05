# Checkpoint 2 Test Matrix

The V2 service tests run against isolated SQLite fixtures and never touch the production DB path.

| Area | Covered now | Remaining gate |
|---|---|---|
| AcceptBid commit | bid, reservation, deal, two outbox events | REST contract matrix |
| Rollback | injected outbox failure leaves no business or outbox rows | failure injection for each write |
| Idempotency | replay returns same result; conflicting payload returns 409 | all HTTP clients/operations |
| FSM | actor authorization and legal transition checks | full international route guard |
| Outbox worker | claim, success, retry/backoff contract, processed state | crash-after-handler durability test |
| Concurrency | SQLite `BEGIN IMMEDIATE` serializes competing writes | 100+ repetition harness and accept/update/cancel/reject matrix |

The full backend suite baseline and post-wiring result are recorded in the checkpoint report. The legacy suite currently has a collection-time `drivers_registration` failure caused by module-level DB resets during collection.
