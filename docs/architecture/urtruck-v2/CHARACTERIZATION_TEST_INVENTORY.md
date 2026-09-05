# UrTruck Foundation V2: Characterization Test Inventory

Purpose: freeze current externally correct behavior before moving logic behind domain owners. A behavior that is a known bug must be marked as bug, not promoted into the new contract.

## Existing Coverage To Reuse

| Area | Existing tests / evidence |
|---|---|
| Cargo creation/listing/public hygiene | `backend/tests/test_public_filter.py`, `test_publish_time.py`, `tests/e2e/urtruck-route-card-click.spec.js`, `qa/agents/cargo.*.spec.js` |
| Trips | `backend/tests/test_market_dashboard.py`, `tests/e2e/urtruck-safe-data-cleanup.live.spec.js`, `qa/agents/trip.detail.clicks.spec.js` |
| Bids | `backend/tests/test_bid_actions.py`, `test_bid_expiry.py`, `test_self_bid_and_webhook_guard.py` |
| Accept/deal creation | `backend/tests/test_bid_actions.py`, `test_live_deal_push_lifecycle.py`, `test_deal_rooms.py` |
| Deal FSM | `backend/tests/test_deal_status_actor_fsm.py`, `test_deal_country_guard.py`, `test_route_country_fsm.py`, `test_deal_event_dedupe_trigger.py` |
| Chat room/message | `backend/tests/test_deal_rooms.py`, `test_unread_badge.py`, `test_unread_deduplication.py`, chat QA reports |
| Voice | `backend/tests/test_chat_voice_transcription.py`, push/voice QA evidence under `qa/evidence/` |
| Push/native/WebPush | `backend/tests/test_push_event_matrix_contract.py`, `test_push_delivery_regressions.py`, `test_push_idempotency.py`, `test_push_token_security.py`, `test_logout_push_cleanup.py` |
| Notifications/unread | `backend/tests/test_notification_source_of_truth.py`, `test_notification_path_matching.py`, `test_canonical_attention_state.py`, `test_unread_*` |
| GPS/tracking | `docs/release/google-play-background-location.md`, physical QA evidence under `qa/evidence/`, marketplace tracking endpoints |
| Documents/attachments/storage | `backend/tests/test_documents_fallback.py`, `test_deal_attachment_upload.py`, `test_attachment_push.py`, `test_storage_env_contract.py`, `test_storage_path_security.py`, `test_signed_url_stability.py` |
| Auth/permissions/security | `backend/tests/test_otp_verify_security.py`, `test_idor_three_accounts.py`, `test_production_security_guards.py`, `test_account_deletion_security.py` |
| i18n RU/ZH/EN/KK | `qa/I18N_COMPLETE_REPORT.md`, `qa/agents/role.i18n.spec.js`, frontend i18n contract tests where present |
| Borders/CGR | `backend/tests/cgr/*`, `test_border_dashboard.py`, `test_borders_lazy_routes.py` |

## Required Before Phase 1

- Cargo:
  - create valid cargo in all supported route/currency/payment combinations.
  - reject invalid/past pickup date.
  - unpublish/republish/extend behavior.
  - active deal prevents edit/unpublish.

- Trips:
  - create valid trip.
  - reject invalid/past departure.
  - unpublish/republish/extend behavior.
  - active deal prevents unpublish.

- Bids:
  - create bid for cargo.
  - create bid for trip.
  - reject self-bid.
  - reject duplicate active bid by same bidder/parent.
  - update/cancel/reject/counter/counter-accept/counter-decline.
  - expire pending/countered bid.

- Accept bid:
  - same bid accepted twice concurrently.
  - two different bids on same cargo accepted concurrently.
  - two different bids on same trip accepted concurrently.
  - accepted bid creates exactly one deal and one canonical chat room.
  - sibling pending/countered bids become rejected.
  - parent cargo/trip becomes reserved.
  - notification/push side effects are observable but do not roll back the deal.

- Deal FSM:
  - every allowed transition.
  - every forbidden transition.
  - driver-only transitions.
  - shipper-only transitions.
  - cancellation from each active state.
  - international route requires border step.
  - domestic route rejects border step.
  - idempotent repeat of same status returns success without duplicate event.

- Chat:
  - pre-accept private chat is denied.
  - accepted/completed deal chat is accessible.
  - cancelled/rejected deal chat visibility follows current contract.
  - `client_msg_id` retry creates one message.
  - read marks legacy `is_read` and read receipt consistently.

- Voice:
  - upload voice.
  - send voice message.
  - transcribe success/failure.
  - retry with stable client operation id.

- Translation:
  - original message returned when provider fails.
  - cache hit by `(message_id,target_lang)`.
  - provider timeout classification.

- Notifications/Push:
  - notification record independent from push delivery.
  - badge count after bid/chat/deal/read flows.
  - dead token invalidation.
  - repeated event key does not send duplicate critical push.

- GPS/Tracking:
  - Start trip permission gate before `accepted -> in_progress`.
  - `/tracking/active` returns only server-approved active deals.
  - heartbeat healthy/problem/lost/restored behavior.
  - completion/cancel stops tracking and preserves last evidence as currently designed.

- Documents:
  - registration document upload.
  - deal attachment reservation duplicate retry.
  - signed URL generation and expiry semantics.
  - waybill unavailable for cancelled/rejected deal.

- i18n:
  - RU/ZH/EN/KK snapshots for deal/bid/chat/GPS/document user-facing errors.

## Shadow Mode Assertions

When V2 contracts are introduced but disabled:

- Log old result and new decision for accept bid.
- Log old result and new decision for deal transition.
- Log old badge formula and new Notifications owner formula.
- Log old chat room resolution and new Chat contract resolution.
- Never expose new result to user until parity is accepted.
