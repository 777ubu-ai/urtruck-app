# ADR: Transactional Outbox

Status: proposed for Foundation V2.

## Context

Current code has a push-specific `push_outbox`, but business mutations often call `send_to_user` and `create_notification` directly after commit. Failure of push should not roll back a deal, but side effects also should not disappear silently.

## Decision

Add a generic DB transactional outbox before introducing a separate broker.

Business transaction:

```text
business state change
+ immutable domain/audit event
+ outbox event
= same DB transaction
```

Worker after commit:

- Creates notification records.
- Enqueues/delivers push.
- Fans out realtime events.
- Updates analytics/projections.

## Event Types

Initial events:

- `BidCreated`
- `BidCountered`
- `BidAccepted`
- `BidRejected`
- `DealCreated`
- `DealStatusChanged`
- `ChatMessageCreated`
- `MessageRead`
- `VoiceMessageCreated`
- `DocumentUploaded`
- `TrackingStarted`
- `LocationUpdated`
- `GPSProblemDetected`

## SQLite Worker Design

- Table `domain_outbox`.
- Claim pending rows with status transition `pending -> processing` guarded by `WHERE status='pending'`.
- Use short transactions.
- Retry with exponential backoff.
- Mark `failed` after max attempts.
- Payloads versioned.

Delivery semantics are **at-least-once**. A process crash after a handler's
external side effect and before `processed_at` can cause the event to be
retried after the processing lease expires. Consumers must deduplicate by
`event_id` (with a durable unique delivery record where the side effect is
local) and must not claim exactly-once external delivery.

## Broker Decision

Kafka/RabbitMQ/etc. are not needed for the first implementation. Consider a broker only if DB outbox metrics show unacceptable lag, fanout volume, or multi-service topology.
