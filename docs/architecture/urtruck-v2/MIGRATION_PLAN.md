# UrTruck Foundation V2: Migration Plan

## Non-Negotiables

- No rewrite from scratch.
- No big-bang refactor.
- No production deploy from this architecture branch.
- No merge to `main` until the four release-fix branches are accepted and an integration baseline is chosen.
- No DB migration to PostgreSQL in Phase 0/1.
- Existing API contracts stay compatible until a replacement is proven.

## Baseline Policy

Current Phase 0 baseline is `3281731db4f5c9f5ebe8670eb2c126963cf770e4`.

Before runtime migration:

1. Wait for acceptance of:
   - `fix/security-otp-coldstart-20260905`
   - `fix/deals-bids-concurrency-20260905`
   - `fix/voice-push-outbox-20260905`
   - `fix/deploy-geocatalog-release-20260905`
2. Create a stable integration baseline commit after those fixes are validated.
3. Re-run AS-IS diff against that baseline.
4. Only then start Phase 1 implementation.

## Phase 0: Architecture Freeze/Map

Deliverables:

- `AS_IS.md`
- `TARGET.md`
- `OWNERSHIP_MATRIX.md`
- `DEPENDENCY_MAP.md`
- ADRs for DB, realtime, Redis, outbox.
- Risk register.
- Characterization test inventory.

Runtime behavior: unchanged.

## Phase 1: Deals/Bids

Goal: first real module boundary around financial/operational core.

Steps:

1. Add characterization tests around current accept/counter/status behavior.
2. Add idempotency table and middleware/helper without switching callers.
3. Introduce `backend/modules/deals/public.py` and `backend/modules/bids/public.py`.
4. Move no production logic first; wrap existing `_transition_deal` and `_finalize_accept_inline` through adapter.
5. Add shadow-mode checker: legacy result vs new domain decision.
6. Add DB invariants compatible with SQLite where safe.
7. Feature flag `DEALS_V2_ENABLED=false`.
8. Switch one command at a time after test parity.

## Phase 2: Notifications/Outbox

Goal: single owner for notification record, badge, push enqueue, retries.

Steps:

1. Add generic transactional outbox table and worker.
2. Keep `push_outbox` as delivery detail or migrate it under Notifications.
3. Convert deal/bid/chat mutations to write domain outbox events.
4. Worker creates notifications and push jobs.
5. Add badge formula contract tests.
6. Feature flag `NOTIFICATIONS_V2_ENABLED`.

## Phase 3: Chat/Translation

Goal: isolate Chat and Translation without UX changes.

Steps:

1. Create Chat public contract for room/message/read.
2. Make Deals emit `DealCreated`; Chat ensures room from event.
3. Keep legacy `/chat/*` endpoints as adapters.
4. Extract Translation provider adapter behind `translate(text, sourceLanguage?, targetLanguage)`.
5. Ensure translation failures never block original message retrieval.

## Phase 4: Tracking/Documents

Goal: isolate GPS lifecycle and documents metadata.

Steps:

1. Tracking owns `deal_tracking`, `deal_locations`, `deal_tracking_events`.
2. GPS problems emit `GPSProblemDetected`; Deals/Notifications policy reacts.
3. Documents owns upload reservation/finalization/listing/signing policy.
4. Batch/cache signing where screens request many URLs.

## Phase 5: Realtime

Goal: selective realtime after stable contracts.

Steps:

1. Add event stream contract for chat messages, read receipts, deal events, unread deltas, live GPS.
2. Keep REST as source of truth and recovery path.
3. Measure mobile reconnect behavior before default-on rollout.

## Phase 6: Database Evolution

Goal: PostgreSQL only if decision remains positive after measurements.

Steps:

1. Prepare dual-write or controlled migration plan.
2. Backfill and compare.
3. Switch reads behind feature flags.
4. Keep rollback to SQLite snapshot until cutover acceptance.
