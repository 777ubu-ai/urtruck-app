# Legacy Adapters — AC5 (2026-09-07)

Every remaining place where a legacy file still owns, or bridges into, another
domain's mutation. Each row is either (a) already delegating to a real module
after AC1–AC4, or (b) an explicit, tracked debt this session did not close.
Nothing here is silent — every mutation-crossing line either delegates to a
module or carries an `# ARCH-ALLOW:` marker the guard in
`backend/tests/architecture/test_cross_domain_writes.py` enforces stays
documented (a marker with no reason fails the guard).

| # | File | Function | Domain crossed | Why it still exists | Feature flag | Mutates? | Safe exit plan |
|---|---|---|---|---|---|---|---|
| 1 | `api/chat.py:614` | `_enrich_rooms_with_deal_context` | Chat → Deals (`UPDATE deals SET chat_room_id=COALESCE(...)`) | One-time repair for deals created before `deals.chat_room_id` was populated (pre-2026-08-21 data). Narrow, idempotent (COALESCE-guarded), read-triggered only when a live lookup finds the missing link. | none | yes, `deals` | Once confirmed no production row has `chat_room_id IS NULL` with a resolvable deal (a single audit query), delete this block and the ARCH-ALLOW marker. Not attempted this session — no owner sign-off on running that audit query against production data. |
| 2 | `api/marketplace.py` `_ensure_chat_room_inline` | thin delegate | Marketplace → Chat (via `modules.chat.application.service.create_or_get_deal_room`) | AC2 closed the SQL duplication; this wrapper remains ONLY so `_finalize_accept_inline` and `accept_counter` (2 legacy call sites) don't need a second edit in this session. | none | no (pure delegate) | Mechanical: replace the 2 remaining call sites with direct `create_or_get_deal_room(...)` calls, delete the wrapper. Deferred to keep this session's diff reviewable in smaller commits — see AC2 commit. |
| 3 | `api/marketplace.py` `_notify_rejected_siblings` | inline `deal_key` re-derivation (read-only) | Marketplace ↔ Chat (SELECT only, no write) | Needs to check whether a room already exists before posting a "your bid lost" system message, without creating one for a bid that never had a room. | none | no (SELECT only, plus a `chat_messages`/`chat_rooms` write already covered by the AC1B guard's own scope — Marketplace is not in the forbidden-writer list for chat tables, only Chat writing to Deals/Bids is) | Should call `modules.chat.application.service.deal_key(...)` instead of re-deriving the key inline (3rd independent declaration of the same format, after `api/chat.py::_deal_key` and the now-removed inline copy in `_ensure_chat_room_inline`). Not changed this session — read-only, lower risk, but still real duplication. |
| 4 | `api/marketplace.py`, 13 endpoints | `_run_deals_v2(...)` early-return pattern | Marketplace ↔ Deals/Bids V2 | `DEALS_V2_ENABLED` dual-path: every bid/deal/trip-status mutation route tries the V2 service first and falls through to legacy SQL only when the flag is off or V2 returns `None`. This IS the intended rollback mechanism, not accidental debt — but it means every one of these 13 routes has two independent implementations of the same operation. | `DEALS_V2_ENABLED` (default off) | yes, both branches | Documented in the 2026-09-06 corrective audit: V2 and legacy are not currently behaviorally identical (V2 lacks `_ensure_bargain_depth`/`price_events`; legacy lacks V2's `LIVE_DEAL_RESERVATION` guard on trip reactivation — the latter gap was closed by the `fix/deals-bids-concurrency-20260905` cherry-pick already merged into this baseline). Full parity + a single shared implementation is the eventual exit; out of scope for this session (AC1–AC6 only). |
| 5 | `api/marketplace.py`, 8 endpoints (`/deals/{id}/tracking*`, `/deals/{id}/location*`) | `_tracking_payload` + `deal_tracking`/`deal_tracking_events`/`deal_locations` writes | Marketplace/Deals → Tracking | **AC3 was not implemented this session** (see final report, "AC3 STATUS: NOT ATTEMPTED"). GPS consent state (`_TRACKING_DEAL_STATUSES` gate, request/respond/approve/deny/heartbeat/stop) is read/write directly in Marketplace; `backend/modules/tracking/` remains an empty scaffold. | none | yes, `deal_tracking`, `deal_tracking_events`, `deal_locations` | See "AC3: recommended design" in the final report — extraction deferred specifically because consent semantics (§10 of the mission) require a dedicated before/after regression suite this session's remaining budget could not responsibly cover alongside AC1–AC4/AC6. |
| 6 | `api/marketplace.py`, 18 call sites | inline `from api.notifications import create_notification` | Marketplace → Notifications | Notifications module has exactly one writer of the `notifications` table (`api/notifications.py` itself) — already the best-isolated domain in the codebase by write-ownership. The 18 local imports are call-site noise (a classic "import to avoid a module-load-order cycle" pattern), not a boundary violation: they call the Notifications *API function*, never touch its table directly. | none | no (delegates to `create_notification`) | Cosmetic only — hoist to a single top-of-file import once the historical circular-import reason (unverified this session) is confirmed gone. Not attempted; zero architectural risk either way. |
| 7 | `modules/deals/application/service.py` `_format_money`/`_CURRENCY_SYMBOLS` | duplicated constant | Deals module ↔ Marketplace (`_money`/`_CURRENCY_SYMBOLS`) | The module must not import `api.marketplace` (would invert the dependency direction the AC1 guard enforces) but needs the same currency-symbol formatting for AC6's push/notification facts. | none | no (pure formatting) | Extract both copies into a shared, dependency-free `services/money_format.py` (or similar) that both `api/marketplace.py` and `modules/deals/application/service.py` import. A characterization test (`test_money_formatting_matches_legacy_marketplace_helper`, added this session) already guards against the two copies silently drifting apart in the meantime. |

## What AC1B's write-guard actually enforces today

`backend/tests/architecture/test_cross_domain_writes.py` scans literal
`INSERT`/`UPDATE`/`DELETE` SQL in `.execute()` calls in `api/chat.py`,
`api/notifications.py`, `services/push_gateway.py`, `services/push_sender.py`,
`infrastructure/outbox/deals_handlers.py`, `infrastructure/outbox/worker.py`,
and anything under `modules/tracking/`, `modules/chat/`, `modules/notifications/`.
Row 1 above is its only current `ARCH-ALLOW` entry — the guard fails the
build if a new undocumented cross-domain write appears in any of those files,
and fails it again if `ARCH-ALLOW` is used without a reason. It does **not**
yet scan `api/marketplace.py` itself for writes *into* Chat/Tracking tables
(rows 2–3, 5 above) — Marketplace is the historical owner of those tables'
schema, so "Marketplace writes chat_rooms" is not itself a violation the way
"Chat writes deals" is; the violation class this guard targets is a
*foreign* domain reaching into another's tables, not the original owner
still holding pre-extraction call sites.
