# ADR: Push Outbox Drain

## Decision

`push_outbox` is drained by exactly one `push_outbox` APScheduler job, running
every 15 seconds inside the existing singleton scheduler. The job calls the
existing `services.push_gateway.process_pending_once()` with the existing
`services.push_sender._send_expo_detailed` adapter. No provider credentials or
second delivery mechanism are introduced.

## Existing path and gap

Business code enqueues `push_outbox` through
`services.push_gateway.enqueue_event()`. Before this change,
`process_pending_once()` had no production caller. The existing scheduler job
`domain_outbox` drains the Foundation domain outbox only; it does not drain
`push_outbox`. Therefore push retry was not automatic.

## Retry and restart contract

- A successful row becomes `sent` and is not selected again.
- A non-terminal failure is returned to `pending` with exponential backoff:
  10s, 20s, 40s, 80s, then capped at 300s.
- Five failed attempts produce terminal `dead` state; the row remains visible
  for diagnosis and is never silently deleted.
- A claimed `processing` row has a five-minute lease. An expired lease is
  requeued on the next worker run, allowing restart recovery without
  duplicating a live worker.
- Delivery deduplication remains provided by the existing event/device
  delivery log and outbox unique key.

## Observability

`/health` and `/health/ready` expose `scheduler.push_outbox` with status,
last run, last error and last batch statistics. A failed drain marks readiness
degraded while the scheduler is enabled.
