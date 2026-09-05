# UrTruck Foundation V2: Ownership Matrix

Rule: one business state has exactly one owner. Phase 0 does not enforce this in code; it records the target ownership and current violations.

| Business state | Target owner | Public contract | Current writer paths | Current risk |
|---|---|---|---|---|
| User auth session / registration level | Auth/Users | `authenticate`, `verify_otp`, `current_user`, `require_level` | `api/registration.py`, `api/auth_otp.py`, `api/social_auth.py`, `database/registration_dal.py` | Registration and profile storage share `drivers_registration`; role/profile updates are not isolated. |
| `cargo.status` | Cargo | `createCargo`, `updateCargo`, `unpublishCargo`, `reserveCargoForDeal`, `releaseCargoAfterDeal`, `completeCargoAfterDeal` | `api/marketplace.py`, `services/bid_expiry.py`, deal transition logic | Deals currently updates cargo directly. |
| `trip.status` | Trips | `createTrip`, `updateTrip`, `unpublishTrip`, `reserveTripForDeal`, `syncTripProgressFromDeal` | `api/marketplace.py`, `services/bid_expiry.py`, deal transition logic | Trip endpoint can trigger deal sync; bid/deal/trip rules share one large module. |
| `bid.status` | Bids | `createBid`, `updateBid`, `cancelBid`, `rejectBid`, `counterBid`, `acceptBidAsPartOfDeal` | `api/marketplace.py`, `services/bid_expiry.py` | No isolated repository/transaction boundary; no global idempotency standard. |
| `deal.status` | Deals/FSM | `transition(dealId, command, actor, context)` | `_transition_deal` in `api/marketplace.py`, accept paths create `accepted` | FSM exists but owner is an API file, not a domain module. |
| Deal timeline | Deals/FSM | `appendDealEvent` internal only, `getTimeline` public read | `database/deal_room_dal.py`, `api/marketplace.py` best-effort calls | Some event writes are best-effort; event taxonomy is partial. |
| Chat rooms/messages | Chat | `ensureRoomForDeal`, `sendMessage`, `listMessages`, `markRead` | `api/chat.py`, `api/deal_room.py`, `database/deal_room_dal.py` | Chat checks deal status directly and imports marketplace semantics by constants. |
| Read receipts | Chat | `markConversationRead`, `unreadByRoom` | `deal_room_dal.mark_read`, `api/chat.py` legacy reads | Dual sources: `is_read` and `message_read_receipts`. |
| Notification records | Notifications | `recordNotification`, `markRead`, `attentionState` | `api/notifications.py`, many direct callers | Many modules create notifications directly. |
| Push delivery/device lifecycle | Notifications/Push submodule | `enqueuePush`, `registerDevice`, `deactivateDevice`, `dispatchPending` | `api/push.py`, `services/push_sender.py`, `services/push_gateway.py` | Push outbox exists but business modules still call push directly. |
| Badge canonical state | Notifications | `getAttentionState(userId)` | `services/attention_state.py`, frontend badge refresh, notification APIs | Recent canonical work exists, but formula is still distributed. |
| GPS permission/tracking lifecycle | Tracking | `startTrackingForDeal`, `recordLocation`, `recordHeartbeat`, `stopTracking`, `emitGpsProblem` | `api/marketplace.py`, frontend hooks, scheduler watchdog | Tracking mutates and reads deal context directly inside marketplace. |
| Documents metadata/lifecycle | Documents | `reserveUpload`, `finalizeUpload`, `listDocuments`, `signedUrl` | `api/deal_room.py`, `api/documents.py`, `api/profile.py`, `api/registration.py` | Document semantics are split by registration/profile/deal. |
| Translation | Translation | `translate(text, sourceLanguage?, targetLanguage)` | `api/chat.py`, `services/translate_service.py` | Chat owns API endpoint and cache table usage. |
| Storage keys/signing | Storage infra | `saveFile`, `saveImage`, `sign` | multiple API modules call storage directly | Cross-domain direct storage use is fine as infra, but metadata ownership is unclear. |
| Border queue/CGR state | Borders | `listCheckpoints`, `watchBooking`, `syncCgr` | `api/borders.py`, `cgr/*`, `database/cgr_dal.py`, `scheduler/cgr_jobs.py` | Mostly isolated; push coupling exists for alerts. |
| Reviews | Reviews | `createReview`, `summary`, `canReview` | `api/reviews.py`, `database/reviews_dal.py` | `has_deal_between` reads deals directly; acceptable until contract introduced. |

## Target Module Owners

- Auth: identity, token verification, registration session.
- Users: profile, role, driver approval state, public counterparty profile.
- Cargo: cargo listing lifecycle and cargo-only validation.
- Trips: trip listing lifecycle and trip-only validation.
- Bids: bid lifecycle before acceptance and bid history.
- Deals/FSM: accepted deal lifecycle, deal transitions, accepted/active exclusivity, immutable transition events.
- Chat: conversations, participants, messages, voice/media message state, read receipts.
- Translation: provider abstraction, cache, timeout/retry/fallback.
- Notifications: notification records, badge/attention, push enqueue policy, device lifecycle.
- Tracking: location permission state, location ingest, heartbeat, GPS health.
- Documents: metadata, validation, upload lifecycle, signed URL policy.
- Storage: binary persistence only; not a business owner.
- Borders: border catalog, queue status, CGR integration.
- Reviews: review permissions and summaries.

## Boundary Tests To Add

- Backend import lint: modules may import another module only through `public.py` or `contracts.py`.
- API route lint: frontend-facing controllers must not execute direct SQL against tables owned by another module.
- SQL write lint: forbid `UPDATE deals SET status` except Deals repository; forbid `UPDATE bids SET status` except Bids repository; same for cargo/trip/tracking/notification read state.
- Event lint: side effects from critical transactions must be outbox events, not direct `send_to_user` calls inside domain service.
