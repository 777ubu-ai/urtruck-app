# Checkpoint 3: Legacy write inventory

Baseline: `70108dc7ca9d106c618bfcc199bb2cd4c34af241`.

This is a source audit of backend runtime writes. `DEALS_V2_ENABLED=false` remains the default. The legacy implementation remains available for rollback; the gate below describes which paths select the V2 owner when the flag is explicitly enabled.

| Legacy path | Writes / side effects | V2 owner when enabled | Gate status |
|---|---|---|---|
| `POST /market/bids` | `bids` insert, cargo `bids_count`, price event, notification/push | `DealsBidsService.create_bid` / Bids owner | V2 adapter; side effects are legacy post-commit only when flag is OFF |
| `PATCH /market/bids/{id}` | amount/message update, price event, push/notification | `DealsBidsService.update_bid` | V2 adapter; conditional version update |
| `POST /market/bids/{id}/counter` | counter fields/status, price event, push/notification | `DealsBidsService.counter_bid` | V2 adapter |
| `POST /market/bids/{id}/accept` | bid accept, cargo/trip reservation, sibling rejection, deal creation, chat/push | `DealsBidsService.accept_bid` | V2 adapter; one transaction plus domain outbox |
| `POST /market/bids/{id}/reject` | bid rejection, counter decrement, price event, chat/push | `DealsBidsService.reject_or_cancel` | V2 adapter |
| `POST /market/bids/{id}/cancel` | bid cancellation, counter decrement, price event, push/notification | `DealsBidsService.reject_or_cancel` | V2 adapter |
| `POST /market/bids/{id}/counter/accept` | legacy `_finalize_accept_inline`, deal/chat/push | `DealsBidsService.accept_counter` | V2 adapter added in Checkpoint 3; no legacy helper on ON path |
| `POST /market/bids/{id}/counter/cancel` | counter fields/status update | `DealsBidsService.counter_response("cancel")` | V2 adapter added in Checkpoint 3 |
| `POST /market/bids/{id}/counter/decline` | counter fields/status update, price event, push/notification | `DealsBidsService.counter_response("decline")` | V2 adapter added in Checkpoint 3 |
| `services/bid_expiry.py` | expiry of pending/countered bids, price event, cached count | Bids owner `expire_bid`; Cargo/Trips owner remains listing expiry | V2 scheduler adapter added; conditional update prevents double expiry |
| cargo/trip `create`, `PATCH`, `extend`, `republish` | listing lifecycle fields | Cargo / Trips owners | Outside Deals/Bids; existing guards reject edits of live deals |
| cargo/trip `delete`, `unpublish` | listing status and open-bid closure | Cargo / Trips owners | Live cargo delete now conflicts when V2 is ON; unpublish already conflicts |
| `PATCH /market/trips/{id}/status` | trip status and historical deal synchronization | Deals owner for live-deal mapping; Trips owner for unbound trip | V2 adapter; `active` reactivation with live deal is 409 |
| `PATCH /market/deals/{id}/status` | deal FSM, cargo/trip sync, tracking, timeline, chat, push | `DealsBidsService.transition_deal` | V2 adapter; domain transition/outbox are authoritative on ON path |
| `_finalize_accept_inline` | direct accept/reserve/deal/chat writes | none on V2 ON path | retained only for OFF and counter legacy rollback |
| legacy `_transition_deal` | direct deal FSM/cargo/trip writes | none on V2 ON path | retained only for OFF and rollback |
| tracking endpoints | `deal_tracking`, `deal_locations`, tracking events, chat/push | Tracking owner | Separate side-effect boundary; no V2 deal transaction call |
| `api/chat.py`, `api/deal_room.py` | rooms/messages/read state and deal room linkage | Chat owner | Not called by V2 deal/bid service; event consumers remain a later integration |
| `api/push.py`, `services/push_gateway.py`, schedulers | device state, push outbox/delivery | Notifications/Push owner | Separate push outbox; failure cannot roll back V2 business tx |
| documents/storage/signing paths | metadata/files/signed URLs | Documents owner | No V2 business transaction dependency |
| `api/qa.py`, cleanup scripts, startup normalization | test/admin cleanup or additive normalization | operational/admin owner | Explicitly excluded from public V2 runtime; never a client bypass |

## Owner proof

For the ON path, all bid status mutations listed above enter through `DealsBidsService`; the three counter subroutes and expiry scheduler were the remaining direct paths and are now adapted. Deal status changes enter `transition_deal`, including the trip-status compatibility adapter. Cargo/trip reservation changes made by accept are performed inside that same Deals transaction; ordinary listing lifecycle remains owned by Cargo/Trips and rejects a live reservation. No V2 service imports Chat, Push, GPS, or Documents internals.

## Remaining legacy writes

Legacy SQL remains intentionally in `backend/api/marketplace.py` for flag-OFF rollback, in `_finalize_accept_inline` and `_transition_deal`, and in post-commit side-effect code. It is not reachable as the primary implementation for the covered V2 routes when `DEALS_V2_ENABLED=true`. Admin/QA cleanup and startup normalization are not user mutation contracts and are not selected by the feature flag.
