# UrTruck Push Event Matrix

Дата: 2026-08-26  
Scope: только `push` / `in-app notifications` / `deep-link` / `badge counters`.

## Статусы

- `PASS` — событие доказано кодом и покрыто automated contract/regression tests.
- `FAIL` — в текущем коде есть реальный contract gap.
- `BLOCKED_EXTERNAL` — для полного device proof нужен реальный iPhone/Android; кодом это не доказать.

## Canonical Matrix

| Event request | Canonical backend event/type | Trigger source | Recipient | In-app notification | Push payload / context | Deep-link | Dedupe / idempotency | Ownership isolation | Automated status | Live screenshot proof |
|---|---|---|---|---|---|---|---|---|---|---|
| `bid_created` | `bid_created` | `POST /market/bids` | cargo owner / trip driver | `create_notification(... "bid_created" ...)` | `title/body/url`, but no typed payload fields beyond default `kind=url` | `/cargos/{id}?bid={bid_id}` or `/trips/{id}?bid={bid_id}` | `FAIL` — no explicit `event_key` / no retry-safe business idempotency proof | recipient resolved from cargo/trip owner ids | `FAIL` | `BLOCKED_EXTERNAL` |
| `bid_accepted` | `bid_accepted` | `POST /market/bids/{bid_id}/accept` | bidder | `create_notification(... "bid_accepted" ...)` | `title/body/url`, no structured typed payload | order card `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` at business endpoint level via bid status gate; no duplicate accept allowed | recipient is accepted bid owner only | `PASS` | `BLOCKED_EXTERNAL` |
| `deal_created` | `deal_created` | `POST /market/bids/{bid_id}/counter/accept` | both sides | `create_notification(... "deal_created" ...)` | `title/body/url`, no structured typed payload | `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` via bid status transition gate | both recipients are explicit deal participants | `PASS` | `BLOCKED_EXTERNAL` |
| `chat_message` | `chat_message` | `POST /chat/send` | opposite room participant | no bell notification row by design; source-of-truth is unread chat counter | structured `data={type, room_id, cargo_id, bid_id, sender_id, recipient_id}` + `kind="chat"` | `/chats/{room_id}` | `PASS` via `client_msg_id` dedupe | recipient derived from room participants | `PASS` | `BLOCKED_EXTERNAL` |
| `chat_attachment` | `chat_attachment` | `POST /chat/conversations/{id}/attachments` | opposite room participant | no bell notification row by design; source-of-truth is unread chat counter | structured `data={type, room_id, attachment_id, sender_id, recipient_id}` + `kind="chat"` | `/chats/{conversation_id}` | `PASS` for upload reservation path; attachment push contract covered | recipient derived from room participants | `PASS` | `BLOCKED_EXTERNAL` |
| `trip_started` | `deal_status` with status `in_progress` | `PATCH /market/deals/{id}/status` | other deal participant | `create_notification(... "deal_status" ...)` | `title/body/url`, status in title | `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` via FSM gate | only the counterparty gets notified | `PASS` | `BLOCKED_EXTERNAL` |
| `gps_tracking_requested` | `tracking_request` | `POST /market/deals/{id}/tracking/request` | driver | `create_notification(... "tracking_request" ...)` | structured `kind=tracking_request`, `data={deal_id, action:"tracking"}` | `/deals/{id}?action=tracking` | `PASS` — repeated pending request short-circuits | only deal driver receives it | `PASS` | `BLOCKED_EXTERNAL` |
| `gps_tracking_enabled` | `tracking_approved` | `POST /market/deals/{id}/tracking/respond` with `approve` | shipper | `create_notification(... "tracking_approved" ...)` | structured `kind=tracking_approved`, `data={deal_id, action:"tracking"}` | `/deals/{id}?action=tracking` | `PASS` — no pending request => 409 | only deal shipper receives it | `PASS` | `BLOCKED_EXTERNAL` |
| `gps_tracking_disabled` | `tracking_declined` / `tracking_stopped` | `POST /market/deals/{id}/tracking/respond` with `decline` OR `/tracking/stop` | shipper | `create_notification(... "tracking_declined" / "tracking_stopped" ...)` | structured `kind`, `data={deal_id, action:"tracking"}` | `/deals/{id}?action=tracking` | `PASS` — protected by tracking state / lock | only deal shipper receives it | `PASS` | `BLOCKED_EXTERNAL` |
| `delivered_by_driver` | `deal_status` with status `delivered` | `PATCH /market/deals/{id}/status` | shipper | `create_notification(... "deal_status" ...)` | `title/body/url` | `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` via FSM gate | only counterparty | `PASS` | `BLOCKED_EXTERNAL` |
| `received_by_shipper` | `deal_status` with status `received` | `PATCH /market/deals/{id}/status` | driver | `create_notification(... "deal_status" ...)` | `title/body/url` | `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` via FSM gate | only counterparty | `PASS` | `BLOCKED_EXTERNAL` |
| `deal_completed` | `deal_status` with status `completed` | `PATCH /market/deals/{id}/status` | other deal participant | `create_notification(... "deal_status" ...)` | `title/body/url` | `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` via FSM gate | only counterparty | `PASS` | `BLOCKED_EXTERNAL` |
| `deal_cancelled` | `deal_status` with status `cancelled` | `PATCH /market/deals/{id}/status` | other deal participant | `create_notification(... "deal_status" ...)` | `title/body/url` | `/cargos/{id}` / `/trips/{id}` fallback `/deals/{id}` | `PASS` via FSM gate | only counterparty | `PASS` | `BLOCKED_EXTERNAL` |
| `bid_expired` | none yet | `services.bid_expiry.expire_stale_marketplace()` | expected bidder/owner not notified | no `create_notification` | no `send_to_user` | none | n/a | n/a | `FAIL` | `BLOCKED_EXTERNAL` |

## Important findings

1. `chat_message` и `chat_attachment` уже имеют лучший payload contract, чем bid/deal events:
   - typed `data.type`;
   - `room_id`;
   - sender/recipient context;
   - foreground suppression для открытой комнаты.

2. `bid_created`, `bid_accepted`, `deal_created`, `deal_status` пока в основном живут на:
   - `title/body`;
   - `url`;
   - default `kind`;
   - без отдельного typed payload schema.

3. `bid_expired` в текущем release не создаёт ни bell notification, ни push:
   - статус ставки/листинга меняется;
   - audit `price_events` пишется;
   - notification contract отсутствует.

4. Источник истины сейчас разделён:
   - чатовые события → unread chat counter;
   - системные/business события → `notifications` bell;
   - home icon badge → сумма `chat unread + notification unread`.

## Automated evidence

- Backend:
  - [backend/tests/test_push_event_matrix_contract.py](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/backend/tests/test_push_event_matrix_contract.py)
  - [backend/tests/test_attachment_push.py](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/backend/tests/test_attachment_push.py)
  - [backend/tests/test_bid_actions.py](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/backend/tests/test_bid_actions.py)
  - [backend/tests/test_unread_deduplication.py](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/backend/tests/test_unread_deduplication.py)
  - [backend/tests/test_unread_badge.py](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/backend/tests/test_unread_badge.py)
  - [backend/tests/test_notification_path_matching.py](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/backend/tests/test_notification_path_matching.py)

- Frontend:
  - [tests/frontend/test_push_deeplink_contract.mjs](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/tests/frontend/test_push_deeplink_contract.mjs)
  - [tests/frontend/profile_notifications_theme_contract.test.mjs](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/tests/frontend/profile_notifications_theme_contract.test.mjs)
  - [tests/frontend/test_release_polish_contracts.mjs](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/tests/frontend/test_release_polish_contracts.mjs)

## Live-device proof status

Реальных screenshot/video доказательств в этом документе нет.  
Они остаются `BLOCKED_EXTERNAL`, пока не выполнен чеклист из:

- [docs/release/push-live-checklist-2026-08-26.md](/Users/bahitzanbahitzanovic/Downloads/urtruck-app/docs/release/push-live-checklist-2026-08-26.md)

## Current NO-GO items in this scope

- `bid_expired` notification/push path отсутствует.
- Для части business push событий нет canonical typed payload schema уровня `chat_message/chat_attachment`.
- Нет фактического real-device screenshot proof для driver/shipper, foreground/background/cold start.
