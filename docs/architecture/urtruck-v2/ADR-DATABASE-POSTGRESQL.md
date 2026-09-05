# ADR: Database Direction - SQLite Now, PostgreSQL Candidate Later

Status: proposed, not approved for implementation.

## Context

Current production DB is SQLite via `backend/database/db.py` and `config.DB_PATH`. WAL, `busy_timeout=5000`, and `synchronous=NORMAL` are applied. The app has critical concurrent write flows: bid accept, deal status, push/device updates, chat writes, GPS heartbeats, and expiry jobs.

## Decision

Do not migrate in Foundation V2 Phase 0 or Phase 1.

Design the first domain refactor to work on current SQLite and keep a separate PostgreSQL target design. PostgreSQL is likely the long-term recommendation for UrTruck if write concurrency and operational scale continue to grow, but it must not be mixed into the first domain refactor.

## SQLite Current-DB Design

Use safe SQLite-compatible improvements:

- Conditional updates for concurrency, as current `_transition_deal` already does.
- Unique indexes where historical data allows, as current `idx_deals_bid_unique` startup migration does.
- Partial unique indexes for idempotency where SQLite supports them.
- `BEGIN IMMEDIATE` for critical accept-bid transaction if lock behavior is characterized.
- Append-only `deal_events` with no public update/delete path.
- Generic `idempotency_keys` and `outbox_events` tables with unique keys.

Limitations:

- No row-level locks.
- Write concurrency is single-writer.
- Cross-table invariants like one live deal per cargo/trip need careful partial unique indexes or transaction guards.
- Long write transactions can block push/logging/GPS writes.
- Online schema changes are limited.

## PostgreSQL Target Design

Benefits:

- Row locking with `SELECT ... FOR UPDATE`.
- Strong foreign keys and check constraints.
- Partial unique indexes for live-deal invariants.
- Better concurrent writes for chat/GPS/push.
- Transactional outbox with `FOR UPDATE SKIP LOCKED`.
- Better observability of locks/query plans.
- Backup/replication options.

Target examples, not production SQL for current DB:

- Unique partial index on `deals(cargo_id)` where status in live set and `cargo_id is not null`.
- Unique partial index on `deals(trip_id)` where status in live set and `trip_id is not null`.
- FK `deals.bid_id -> bids.id`.
- FK `bids.cargo_id -> cargos.id`, `bids.trip_id -> trips.id`.
- Check exactly one parent for production bids where required.
- Outbox worker claims with `FOR UPDATE SKIP LOCKED`.

Costs:

- Migration complexity and rollback risk.
- Need managed backup/restore/runbook.
- Need deployment changes, credentials, migrations, connection pool.
- Need data cleanup before enabling strict constraints.
- Need mobile/API cutover plan to avoid downtime.

## Recommendation

Short term: keep SQLite, add characterization tests, idempotency, outbox, and SQLite-safe invariants.

Medium term: run a measured PostgreSQL migration spike after Phase 2. PostgreSQL should be recommended if metrics show SQLite lock contention, outbox lag, GPS/chat write pressure, or operational backup risk.

## Low-Downtime Migration Plan Sketch

1. Freeze schema changes.
2. Add migration scripts and data validators.
3. Clean historical duplicates/invariant violations.
4. Create PostgreSQL schema with stronger constraints.
5. Backfill from SQLite snapshot.
6. Dual-write selected non-critical tables in shadow mode.
7. Compare row counts/checksums/business projections.
8. Switch read path for internal admin first.
9. Switch API read/write behind feature flag.
10. Keep SQLite rollback snapshot until acceptance window passes.
