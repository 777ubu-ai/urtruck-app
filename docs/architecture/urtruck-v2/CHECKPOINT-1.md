# Foundation Checkpoint 1

## Scope

This checkpoint adds a side-by-side modular skeleton, public contracts, architecture enforcement, SQLite-compatible idempotency/outbox designs, and test scaffolding. `DEALS_V2_ENABLED` defaults to `false`; no REST handler or scheduler is wired to the new path.

## AcceptBid transaction design

The future adapter must execute one SQLite transaction with `BEGIN IMMEDIATE`, then validate and lock the Bid, Cargo, Trip, and existing live Deal condition. It must apply bid acceptance, Deal creation, cargo/trip reservation, competing-bid closure, immutable transition event, and `domain_outbox` insertion before `COMMIT`. Any error rolls back the complete unit. The implementation must re-check affected rows and treat zero-row conditional updates as a concurrency conflict.

SQLite-compatible guarantees in this checkpoint are conditional writes, foreign-key enforcement at connection setup, unique idempotency keys, and unique Deal constraints where the current schema permits them. PostgreSQL partial unique indexes remain a target invariant and are not claimed as implemented here.

## Domain events

The first event names are `BidAccepted`, `DealCreated`, `DealStatusChanged`, and `DealCancelled`. `domain_outbox` is separate from legacy `push_outbox`. The worker contract supports claim/retry/handler dispatch; connection-specific claiming and metrics remain an integration task after the accepted baseline.

## Shadow mode and flag

Shadow comparison must compare decisions and calculated results only. It must not execute a second business mutation or create a second Deal. Mismatch logs must include correlation ID, operation ID, inputs, legacy result, new result, and reason. The feature flag is fail-safe OFF and is not read by existing production routes in this checkpoint.

## Phase 1 test gate

The characterization inventory in `CHARACTERIZATION_TEST_INVENTORY.md` remains the source list. Before enabling the flag, add repeated concurrency tests for accept/accept, accept/cancel, accept/reject, accept/update, counter/accept, and cargo/trip reuse, plus FSM authorization and idempotency tests. A green scaffold test is not evidence that the legacy behavior has already been migrated.
