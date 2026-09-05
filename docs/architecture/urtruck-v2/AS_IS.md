# UrTruck Foundation V2: AS-IS

Дата аудита: 2026-09-05.
Baseline branch/SHA: `arch/urtruck-foundation-v2-0001` от `3281731db4f5c9f5ebe8670eb2c126963cf770e4`.
Исходная рабочая ветка до создания architecture branch: `integration/chat-filter-final-20260904`.

Scope Phase 0: только архитектурная карта и migration design. Runtime behavior не менялся.

## Runtime

- Frontend: React Native + Expo SDK 52, web/PWA через `react-native-web`.
- Backend: FastAPI, Python, SQLite, APScheduler. `config.DB_PATH` по умолчанию указывает на `/home/ubuntu/urtruck/backend/database/security.db`.
- Supabase: OTP для клиентов и потенциальный Storage; основная production DB по проектным инструкциям - SQLite.
- Redis: `REDIS_URL` объявлен в `backend/config.py`, но в найденном критическом marketplace/chat/push path Redis не является source of truth.
- Push: Web Push, Expo, FCM/APNs через `backend/services/push_sender.py` и `backend/services/push_gateway.py`.

## Backend API Surface

FastAPI монтируется в `backend/main.py`:

- `/api/v1`: security/scoring/blacklist/OCR/gov/parsers из `backend/api/routes.py`.
- `/api/v1/register`: registration, OTP, profile draft, documents upload, moderation из `backend/api/registration.py`.
- `/api/v1/register/social`: social auth из `backend/api/social_auth.py`.
- `/api/v1/driver/registration`: driver draft/submit из `backend/api/driver_registration.py`.
- `/api/v1/market`: cargos, trips, bids, deals, tracking, waybill из `backend/api/marketplace.py`.
- `/api/v1/chat`: rooms, messages, send, unread, photo, voice, typing, translate, transcribe из `backend/api/chat.py`.
- `/api/v1`: deal-room overlay: conversations, read receipts, attachments, deal timeline, support escalation из `backend/api/deal_room.py`.
- `/api/v1/notifications`: notification center/read/unread/attention из `backend/api/notifications.py`.
- `/api/v1/push`: web/native token lifecycle, debug push из `backend/api/push.py`.
- `/api/v1/borders`: border/CGR endpoints из `backend/api/borders.py`.
- `/api/v1/searches`, `/api/v1/favorites`, `/api/v1/reviews`, `/api/v1/docs`, `/api/v1/qr`, `/api/v1/users`, `/api/v1/routing`, `/api/v1/qa`.
- `/metrics`, `/health`, `/api/v1/errors*` из `backend/api/metrics.py`.
- `/admin` из `backend/api/admin.py`.

## Tables And State

Current DB schemas are additive SQLite DDL plus startup migrations.

- Auth/Users/Registration: `drivers_registration`, `verification_codes`, `reg_sessions`, `consent_audit`.
- Cargo: `cargos`.
- Trips: `trips`.
- Bids: `bids`, `price_events`.
- Deals/FSM: `deals`, partial immutable timeline in `deal_events`.
- Chat: `chat_rooms`, `chat_messages`, `conversation_participants`, `message_read_receipts`.
- Voice: stored as chat message with `is_voice`, `voice_duration`, `voice_transcript*`; binary is Storage key in `photo_url`.
- Translation: `chat_translations`.
- Notifications: `notifications`.
- Push: `push_subscriptions`, `push_tokens_native`, `push_devices`, `push_outbox`, `push_delivery_log`, `push_log`.
- Tracking/GPS: `deal_locations`, `deal_tracking`, `deal_tracking_events`.
- Documents/attachments: registration document columns in `drivers_registration`, `message_attachments`, profile pro-documents, generated waybill links.
- Borders/CGR: `border_checkpoints`, `cgr_scoreboard`, `cgr_booking_status`, `cgr_booking_poll_log`, `cgr_blocklist`, `cgr_blocklist_matches`, `cgr_push_throttle`.
- Reviews: `reviews`.
- Storage: local/Supabase/S3 keys in DB rows; files handled by `services/storage_service.py` and signed by `services/file_signing.py`.

## Domain Map

| Domain | Current backend files | Frontend consumers | Main tables | Jobs/tests |
|---|---|---|---|---|
| Auth | `api/auth_otp.py`, `api/registration.py`, `api/social_auth.py`, `api/verification_gate.py`, `services/otp_service.py`, `services/sms_mobizon.py`, `services/email_service.py` | `AuthContext.js`, onboarding screens, `registration.js`, `push.js` auto-register | `drivers_registration`, `verification_codes`, `reg_sessions`, `consent_audit` | `test_otp_verify_security.py`, `test_email_*`, `test_account_deletion_security.py` |
| Users | `api/profile.py`, `database/registration_dal.py` | `ProfileScreen*`, `EditProfileScreen`, `dealCounterpartyAPI.js` | `drivers_registration`, pro document fields | profile/onboarding contract tests |
| Cargo | `api/marketplace.py` | `CargoFeedScreen`, `CargoDetail*`, `CreateCargoScreen`, `FeedScreen`, `marketAPI.js` | `cargos`, `bids`, `deals` | `test_public_filter.py`, `test_publish_time.py`, E2E cargo specs |
| Trips | `api/marketplace.py` | `MyTripsScreen`, `TripDetail*`, `CreateTripScreen`, `TrackTruckScreen` | `trips`, `bids`, `deals` | market/trip/status tests |
| Bids | `api/marketplace.py`, `services/bid_expiry.py` | `BidModal`, `CargoDetail*`, `TripDetail*`, `ChatsListScreen`, `marketAPI.js` | `bids`, `price_events`, `deals` | `test_bid_actions.py`, `test_bid_expiry.py`, live deal push tests |
| Deals | `api/marketplace.py`, `database/deal_room_dal.py` | `DealWorkspaceScreen*`, `DealWorkspaceRoute`, `ChatsListScreen`, `dealActionResolver.js` | `deals`, `deal_events`, `deal_tracking` | `test_deal_status_actor_fsm.py`, `test_deal_country_guard.py`, `test_route_country_fsm.py` |
| Chat | `api/chat.py`, `api/deal_room.py`, `database/deal_room_dal.py` | `ChatScreen*`, `ChatsListScreen`, `DealWorkspaceScreen`, `chatAPI.js`, `outbox.js` | `chat_rooms`, `chat_messages`, `conversation_participants`, `message_read_receipts` | `test_deal_rooms.py`, `test_unread_*`, chat E2E |
| Voice | `api/chat.py`, `services/speech_to_text_service.py` | `voiceRecorder.js`, `VoiceMessageBubble*`, `DealWorkspaceScreen` | `chat_messages`, Storage | `test_chat_voice_transcription.py` |
| Translation | `api/chat.py`, `services/translate_service.py` | `chatAPI.translate`, voice bubbles | `chat_translations` | translation covered indirectly |
| Notifications | `api/notifications.py`, `services/attention_state.py` | `notificationsAPI.js`, `useUnreadNotifications.js`, `appBadge.js`, `NotificationsScreen` | `notifications` plus chat/push tables for attention | `test_notification_*`, `test_canonical_attention_state.py` |
| Push | `api/push.py`, `services/push_sender.py`, `services/push_gateway.py` | `push.js`, `pushNotifications.js`, `PushPermissionBanner`, native startup hooks | `push_*` tables | `test_push_*`, device QA reports |
| Read/Unread | `api/chat.py`, `api/deal_room.py`, `api/notifications.py`, `services/attention_state.py` | `dealsUnread.js`, `unreadEvents.js`, `useUnreadNotifications.js`, `BottomNav.js` | `chat_messages.is_read`, `message_read_receipts`, `notifications.is_read` | `test_unread_badge.py`, `test_unread_deduplication.py` |
| Tracking/GPS | `api/marketplace.py`, `scheduler/jobs.py`, `useDealLocationBroadcast.js` | `DealLocationPermissionGate`, `backgroundLocation.js`, `locationPermissionCoordinator.js`, `TrackTruckScreen` | `deal_tracking`, `deal_locations`, `deal_tracking_events` | GPS QA, `google-play-background-location.md` |
| Documents | `api/documents.py`, `api/deal_room.py`, `api/profile.py`, `api/registration.py`, `services/storage_service.py` | `DealAttachments`, registration screens, `proDocs.js`, `chatAPI.uploadAttachment` | document fields, `message_attachments` | `test_documents_fallback.py`, `test_deal_attachment_upload.py`, signed URL tests |
| Storage | `services/storage_service.py`, `services/file_signing.py` | upload utilities | keys in multiple domain tables | storage env/path/signed-url tests |
| Borders | `api/borders.py`, `api/borders_lazy.py`, `cgr/*`, `database/cgr_dal.py`, `scheduler/cgr_jobs.py` | `QueueScreen*`, `CargoRuqsatInfoScreen`, `cgrAPI.js` | `cgr_*`, `border_checkpoints` | `backend/tests/cgr/*` |
| Reviews | `api/reviews.py`, `database/reviews_dal.py` | `ReviewsScreen`, `RatingModal`, `reviews.js` | `reviews` | `test_reviews` coverage indirect/direct |

## State Mutation Paths

### `deal.status`

Primary paths:

- `PATCH /api/v1/market/deals/{deal_id}/status` calls `_transition_deal`.
- `PATCH /api/v1/market/trips/{trip_id}/status` can synchronize linked deals through `_transition_deal`.
- `POST /api/v1/market/bids/{bid_id}/accept` and `POST /api/v1/market/bids/{bid_id}/counter/accept` create `deals.status='accepted'`.

Current safeguards:

- `_DEAL_FLOW` validates status graph.
- `_DRIVER_ONLY_TRANSITIONS` and `_SHIPPER_ONLY_TRANSITIONS` validate actor role for key transitions.
- `_deal_country_guard` validates international route border step.
- `UPDATE deals ... WHERE id=? AND status=?` catches concurrent status changes.
- Some transition evidence is written to `deal_events`; some failures are best-effort and can be logged without failing the business action.

Bypass/coupling notes:

- Deals/FSM lives inside `backend/api/marketplace.py`, not an isolated domain owner.
- Trip status endpoint and tracking side effects still sit in the same API module.
- Outbound push/in-app notification after transition is post-commit and best-effort, not a generic transactional outbox event.

### `bid.status`

Paths:

- `POST /market/bids`: creates `pending`.
- `PATCH /market/bids/{id}`: edits pending/countered amount/message.
- `POST /market/bids/{id}/accept`: validates and updates to `accepted`.
- `POST /market/bids/{id}/cancel`: bidder cancels.
- `POST /market/bids/{id}/reject`: owner rejects.
- `POST /market/bids/{id}/counter`: sets `countered`.
- `POST /market/bids/{id}/counter/accept`: accepts counter and creates deal.
- `POST /market/bids/{id}/counter/cancel`, `/counter/decline`.
- `services/bid_expiry.py`: expires pending/countered bids.
- Cargo/trip unpublish/delete in `marketplace.py`: cancels pending/countered sibling bids.

Current safeguards:

- Duplicate active bid check by author and parent in application code.
- Conditional status update in accept path.
- `price_events` records proposed/accepted/rejected/expired/counter events.

Gaps:

- No DB-level unique constraint for one active bid per actor/parent in SQLite.
- No generic idempotency table for create/update/cancel commands.

### `trip.status`

Paths:

- `POST /market/trips`: creates `active`.
- `PATCH /market/trips/{id}`: edits active trip.
- `PATCH /market/trips/{id}/unpublish`: `unpublished`.
- `PATCH /market/trips/{id}/republish`: `active`.
- `POST /market/trips/{id}/extend`: updates date.
- `_finalize_accept_inline`: `booked`.
- `_transition_deal`: maps deal status to `in_transit`, `delivered`, `completed`, `cancelled`.
- `services/bid_expiry.py`: `expired`.

### `cargo.status`

Paths:

- `POST /market/cargos`: creates `active`.
- `DELETE /market/cargos/{id}`: `cancelled`.
- `PATCH /market/cargos/{id}`: updates active cargo fields.
- `PATCH /market/cargos/{id}/unpublish`: `unpublished`.
- `PATCH /market/cargos/{id}/republish`: `active`.
- `POST /market/cargos/{id}/extend`: updates pickup date.
- `_finalize_accept_inline`: `taken`.
- `_transition_deal`: `completed` on deal completion, `active` on cancellation.
- `services/bid_expiry.py`: `expired`.

### Read/unread state

Paths:

- `chat_messages.is_read` is updated in `api/chat.py` and `database/deal_room_dal.py`.
- `message_read_receipts` is appended in `deal_room_dal.mark_read`.
- `notifications.is_read` is updated by `read-all`, `read-url`, `read/{id}`, and by detail endpoints that call `mark_notifications_read_by_urls`.
- Canonical attention count is computed by `services/attention_state.py` using notifications, chat unread, tracking unread, and stale notification reconciliation.
- Frontend has `unreadEvents.js`, `dealsUnread.js`, `useUnreadNotifications.js`, and local badge refresh paths.

Gaps:

- There are multiple formulas for badge/attention, though recent tests indicate consolidation work is underway.
- Read receipts and legacy `is_read` are both sources during migration.

### Push state

Paths:

- Token lifecycle in `api/push.py` updates `push_subscriptions`, `push_tokens_native`, `push_devices`.
- Delivery/logging in `services/push_sender.py` and `services/push_gateway.py`.
- `push_outbox` exists for push retry, but critical business mutations still call push/notification helpers directly after commit.
- `push_log.event_key` dedupes selected transition notifications.

### Tracking state

Paths:

- `_transition_deal(accepted -> in_progress)` creates/activates `deal_tracking` and writes `deal_tracking_events`.
- `/deals/{id}/tracking/request|respond|stop` manipulates tracking consent/lifecycle.
- `/deals/{id}/location` updates `deal_locations`.
- `/deals/{id}/tracking/heartbeat` updates signal health.
- `run_gps_watchdog_once` from marketplace is called by `scheduler/jobs.py`.
- Frontend `useDealLocationBroadcast.js` polls `/tracking/active` and sends location/heartbeat.

Gaps:

- Tracking is coupled to Deals in marketplace module.
- GPS problem handling emits push/notification directly rather than a generic domain event with policy routing.

## Existing Idempotency

Partial idempotency already exists:

- Chat messages: `chat_messages.client_msg_id` plus partial unique index `(sender_id, client_msg_id) WHERE client_msg_id IS NOT NULL`.
- Chat attachments: `message_attachments.client_upload_id` unique by `(conversation_id, uploader_id, client_upload_id)`.
- Push: `push_outbox UNIQUE(event_id, recipient_user_id)` and `push_delivery_log` dedupe index; `push_log.event_key` for selected duplicate suppression.
- Chat rooms: `chat_rooms.deal_key UNIQUE`.
- Deals: startup migration creates `idx_deals_bid_unique` when historical duplicates allow.

Missing:

- General `Idempotency-Key` contract for create bid, accept bid, cancel bid, deal transition, document finalize, voice finalize, and GPS-sensitive commands.
- Persisted operation result replay by actor/endpoint/body hash.

## Existing Outbox

`push_outbox` is a push-delivery outbox, not a domain transactional outbox.

Missing:

- Generic `outbox_events` table written in the same DB transaction as business state.
- Consumer ownership and delivery state per handler.
- Event schema/versioning.
- Worker metrics for queue lag, attempts, dead letters across domains.

## Characterization Test Inventory

Existing useful tests:

- Deals/Bids/FSM: `backend/tests/test_bid_actions.py`, `test_bid_expiry.py`, `test_deal_status_actor_fsm.py`, `test_deal_country_guard.py`, `test_route_country_fsm.py`, `test_live_deal_push_lifecycle.py`.
- Chat/Deal room: `test_deal_rooms.py`, `test_chat_voice_transcription.py`, `test_deal_attachment_upload.py`, `test_attachment_push.py`.
- Notifications/Push/Unread: `test_notification_source_of_truth.py`, `test_notification_path_matching.py`, `test_canonical_attention_state.py`, `test_unread_badge.py`, `test_unread_deduplication.py`, `test_push_*`.
- Documents/Storage: `test_documents_fallback.py`, `test_storage_env_contract.py`, `test_storage_path_security.py`, `test_signed_url_stability.py`.
- Auth/Security: `test_otp_verify_security.py`, `test_account_deletion_security.py`, `test_idor_three_accounts.py`, `test_production_security_guards.py`, `test_self_bid_and_webhook_guard.py`.
- Borders/CGR: `backend/tests/cgr/*`, `test_border_dashboard.py`, `test_borders_lazy_routes.py`.
- Frontend/E2E/QA: `tests/e2e/*`, `qa/agents/*`, `qa/*REPORT*.md`.

Required additions before Phase 1:

- Concurrent accept of two different bids for same cargo.
- Concurrent accept retry of same bid with same/different idempotency key.
- Cargo/trip invariant checks under SQLite.
- Characterization for every old status transition and every forbidden actor.
- Message send retry across client offline outbox and server `client_msg_id`.
- Voice upload/send/finalize retry matrix.
- Attachment upload reservation crash/retry matrix.
- Notification badge formula snapshot by scenario.
- GPS start permission gate plus `/tracking/active` heartbeat behavior.
- RU/ZH/EN/KK user-visible contract snapshots for deal, bid, chat, GPS, document errors.
