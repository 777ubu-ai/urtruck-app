# ADR: Redis

Status: proposed, not approved for implementation.

## Context

`REDIS_URL` exists in `backend/config.py`, but current critical state is SQLite. Redis must not become business source of truth.

## Decision

Do not add or expand Redis in Phase 0/1.

Redis is acceptable only for measured needs:

- Multi-instance rate limiting.
- Short-lived cache.
- Realtime fanout.
- Presence.
- Distributed coordination for workers after the app runs multiple instances.

## Forbidden Uses

- Deal status source of truth.
- Bid/cargo/trip state.
- Idempotency source of truth for critical mutations.
- Notification canonical unread count.
- Durable outbox.

## Future Use Pattern

If introduced:

- DB remains source of truth.
- Redis cache keys have TTL.
- Cache invalidation comes from outbox events.
- Every Redis-backed feature has fallback to DB/REST.
- Metrics include hit rate, stale reads, memory, evictions, and reconnect errors.
