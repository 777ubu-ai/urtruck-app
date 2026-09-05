# ADR: Realtime Transport

Status: proposed, not approved for implementation.

## Context

UrTruck currently relies on REST polling plus push. Realtime-worthy streams are:

- Incoming chat messages.
- Delivery/read updates.
- Deal events/status.
- Unread deltas.
- Live GPS.

Push remains required for background and terminated app states.

## Options

### SSE

Pros:

- Simple server implementation.
- Good for one-way event stream.
- Works well with REST recovery.

Cons:

- Mobile background behavior is weak.
- Client-to-server events still use REST.
- Proxy/timeouts/reconnect need careful handling.

### WebSocket

Pros:

- Bidirectional.
- Better for typing/presence/live GPS fanout.
- Lower latency for chat-like UX.

Cons:

- More complex auth, reconnect, backpressure, mobile lifecycle.
- Requires connection metrics and fanout strategy.
- Not justified for every domain.

### Existing provider / hybrid

Pros:

- Provider may handle reconnect/fanout.
- Faster rollout if already approved.

Cons:

- Vendor lock-in.
- Must preserve backend as source of truth.

## Decision

Use hybrid strategy:

- Keep REST for commands and recovery reads.
- Keep push for background/terminated critical notifications.
- Phase 5 should start with SSE or provider-backed one-way stream for deal/chat/unread events if mobile testing passes.
- Add WebSocket only for measured needs: high-frequency live GPS, typing/presence, or two-way realtime workflows.

## Event Contract

All realtime messages should be projections of committed outbox/domain events:

- `ChatMessageCreated`
- `MessageRead`
- `DealStatusChanged`
- `UnreadDeltaChanged`
- `LocationUpdated`
- `GPSProblemDetected`

Clients must treat realtime as notification of change, not source of truth. On reconnect, client fetches REST snapshot using last seen event id.
