# UrTruck Foundation V2: Target Architecture

Target: Modular Monolith + Strong Domain Ownership + ACID Invariants + Transactional Outbox + Idempotency + Selective Realtime.

This is an evolutionary architecture. Existing UI/UX, roles, API contracts, mobile/web support, chat, GPS, translation, push, and documents stay backward compatible until a replacement path is proven.

## Shape

```text
Android / iOS / Web
  -> REST + selective realtime
  -> API/BFF layer
  -> modular monolith domains
  -> SQLite now, PostgreSQL candidate later
  -> transactional outbox + workers
```

## Module Structure

Target folder shape, introduced gradually:

```text
backend/modules/
  auth/
    public.py
    application.py
    domain.py
    repository.py
    tests/
  cargo/
  trips/
  bids/
  deals/
  chat/
  translation/
  notifications/
  tracking/
  documents/
  borders/
  reviews/
  shared/
    db.py
    idempotency.py
    outbox.py
    observability.py
```

Controllers remain compatible under existing route prefixes during migration.

## Deals/FSM Contract

Public command:

```python
transition(deal_id, command, actor, context) -> DealTransitionResult
```

Required steps:

1. Authenticate.
2. Authorize actor against deal and command.
3. Load current state.
4. Validate actor role.
5. Validate business invariant.
6. Execute atomic DB operation.
7. Append immutable deal event.
8. Append outbox event in same transaction.
9. Commit.

Commands should be business named, not arbitrary status strings:

- `StartTrip`
- `MarkAtBorder`
- `MarkDelivered`
- `ConfirmReceived`
- `CompleteDeal`
- `CancelDeal`

Legacy `PATCH /market/deals/{id}/status?new_status=...` remains as adapter until clients migrate.

## ACID Invariants

Must be enforced at DB level where current engine allows:

- One live accepted/active deal per cargo.
- One live accepted/active deal per trip.
- One deal per accepted bid.
- Bid parent consistency: bid references cargo or trip, not neither for production acceptance.
- Immutable transition history append-only.
- Idempotency records unique per actor + operation key.
- Optimistic version/concurrency check on mutable aggregate roots.

## Idempotency Contract

Backward-compatible HTTP:

- Header: `Idempotency-Key: <client generated stable id>`.
- Optional body field remains accepted where old clients already use it, e.g. `client_msg_id`, `client_upload_id`.
- Scope: `(actor_id, route_group, idempotency_key)`.
- Store request hash, response status, response body, created resource ids, expiry.
- Same key + same hash returns saved response.
- Same key + different hash returns 409 `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.

Critical mutations:

- create bid
- accept bid
- cancel bid
- deal transition
- send message
- voice upload/finalize
- document upload/finalize
- GPS transition-sensitive operations

## Transactional Outbox

Generic table, separate from `push_outbox`:

```text
outbox_events(
  id,
  event_id unique,
  aggregate_type,
  aggregate_id,
  event_type,
  event_version,
  payload_json,
  occurred_at,
  available_at,
  status,
  attempts,
  locked_by,
  locked_until,
  last_error,
  created_at
)
```

Critical transaction writes business state and outbox event together.

Consumers:

- Chat room provisioning.
- Notifications records and push enqueue.
- Realtime fanout.
- Analytics/audit.
- GPS policy responses.
- Document notifications.

## Frontend Target

Feature boundaries:

- `features/auth`
- `features/cargo`
- `features/trips`
- `features/bids`
- `features/deals`
- `features/chat`
- `features/notifications`
- `features/tracking`
- `features/documents`
- `shared/api`
- `shared/realtime`
- `shared/ui`
- `shared/i18n`

Rules:

- One client data owner per server state.
- No duplicate polling loops for unread/deals/tracking.
- Existing screens migrate behind current route names.
- Android deal entry must continue through `DealWorkspaceRoute`.

## Observability

Required fields:

- `request_id`
- `correlation_id`
- `operation_id` / idempotency key
- actor id/role
- aggregate type/id
- old/new status where applicable
- outbox event id
- external provider attempt id

Critical operation trace:

```text
client command -> API -> transaction -> domain change -> outbox -> worker -> side effect
```

Metrics:

- p50/p95/p99 latency.
- SQL count and write count.
- outbox pending/dead/lag.
- push retry/dead-token counts.
- realtime connections/reconnects.
- DB busy timeout/lock count.
- GPS freshness and stale active tracking count.
