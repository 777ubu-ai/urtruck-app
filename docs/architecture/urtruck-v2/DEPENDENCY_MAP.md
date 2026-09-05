# UrTruck Foundation V2: Dependency Map

## Current High-Level Dependencies

```text
React Native / Expo / Web
  -> src/utils/*API.js
  -> FastAPI routers in backend/api/*
  -> direct SQLite access through database.db.get_conn()
  -> services/*
  -> storage / push providers / OTP providers / routing providers
```

## Backend Coupling Hotspots

- `backend/api/marketplace.py`
  - Owns cargos, trips, bids, deals, deal FSM, tracking, location, waybill signing, notification fanout, chat room creation.
  - Imports `database.db`, `api.verification_gate`, `api.push.send_to_user`, storage/file signing, geo normalization.
  - Calls `api.notifications.create_notification` locally in many post-commit paths.
  - Calls `database.deal_room_dal.create_deal_event`.

- `backend/api/chat.py`
  - Owns chat rooms/messages, support bot, chat idempotency, voice metadata, translation endpoints.
  - Reads `deals.status` to gate chat access.
  - Enriches rooms with `deals`, `cargos`, `bids`, `drivers_registration`, `support_escalations`.
  - Calls push directly.

- `backend/api/deal_room.py`
  - Adds conversations, participants, attachments, read receipts, deal timeline.
  - Uses storage and push directly.
  - Is both Chat extension and Documents/Deal timeline extension.

- `backend/services/attention_state.py`
  - Computes notification attention from notification rows, bids, deals, chat, tracking.
  - Useful candidate for canonical Notifications contract, but currently reads many domains.

- `backend/services/push_sender.py` and `backend/services/push_gateway.py`
  - Device registry, push delivery, push logging, partial push outbox.
  - Called directly from marketplace/chat/notifications/jobs.

- `backend/database/db.py`
  - Global SQLite connection factory and request-time marketplace expiry hook.
  - `get_conn()` is a god-node. Any module can write any table.

## Frontend Coupling Hotspots

- `src/utils/marketAPI.js`
  - Cargo, trip, bid, deal, tracking, waybill, saved routes, favorites.
  - No feature-boundary split yet.

- `src/utils/chatAPI.js`
  - Legacy chat plus deal conversations, attachments, timeline, accept bid convenience method, translation and voice uploads.

- `src/screens/DealWorkspaceScreen.js`
  - Composes deal status transitions, chat, documents, tracking, map, timeline, voice, attachments.

- `src/screens/ChatsListScreen.js`
  - Deals inbox, bid offers, chat unread, active/completed filtering.

- `src/components/deal/DealWorkspaceRoute.js`
  - Required route entry for Android location disclosure gate.

- `src/utils/unreadEvents.js`, `src/utils/dealsUnread.js`, `src/utils/appBadge.js`, `src/utils/useUnreadNotifications.js`
  - Distributed badge/read refresh coordination.

## Current External Dependencies

- SQLite: primary DB.
- APScheduler: background jobs.
- FCM/APNs/Expo/WebPush: push delivery.
- Supabase/S3/local FS: storage providers.
- OpenAI/Google/DeepL candidates: translation provider adapters in `services/translate_service.py`.
- Mobizon/WhatsApp/Email: OTP channels.
- CGR endpoints/parsers for border information.
- Routing/geocoding services in `api/routing.py` and related services.

## Target Dependency Direction

```text
api/bff
  -> domain public contracts
  -> application services
  -> repositories
  -> db/outbox/storage/push adapters
```

Allowed domain-to-domain communication:

- Synchronous public contract for immediate invariants in the same transaction, e.g. Deals accepts a bid through Bids public application service and reserves Cargo/Trip through their public contracts.
- Asynchronous outbox event for side effects, e.g. `DealCreated -> Chat.ensureRoom`, `DealStatusChanged -> Notifications.enqueue`.

Forbidden target dependencies:

- Controller in one domain importing another domain repository.
- Direct SQL writes to tables owned by another module.
- Frontend deciding arbitrary FSM transition outside server command contract.
- Push/translation/storage providers imported by core domain logic.
