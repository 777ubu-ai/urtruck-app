# Push event matrix — UrTruck (26.08.2026)

Единая таблица всех push/in-app уведомлений сделки: от размещения ставки
до её завершения. Для КАЖДОГО события зафиксировано:

- **backend trigger** — точное место в коде;
- **notification type** — что попадёт в `/api/v1/notifications`;
- **push?** — идёт ли APNs/FCM пуш;
- **recipient** — как определяется получатель;
- **deep-link URL** — куда открывается tap;
- **dedupe** — как гасится дубль (event_key либо естественный контракт);
- **ownership** — какие защиты от «чужой пуш».

Источник истины: `backend/api/marketplace.py`, `backend/api/chat.py`,
`backend/api/deal_room.py`, `backend/api/notifications.py` (helper
`create_notification`), `backend/api/push.py` (helper `send_to_user`).

Live-проверка отдельно, в `qa/checklist/push-event-matrix-live.md`.

## Матрица

| # | Event | Backend trigger | Notification type | Push | Recipient rule | URL / deep-link | Dedupe | Ownership |
|---|---|---|---|---|---|---|---|---|
| 1 | **bid_created** | `marketplace.py::create_bid` (post-commit block, ~line 1445–1456) | `bid_created` | ✅ `send_to_user` | cargo → `cargos.owner_id`; trip → `trips.driver_id` | `/cargos/{id}?bid={bid_id}` или `/trips/{id}?bid={bid_id}` | Естественный: `duplicate_bid` возвращает 409 → повторный event не создаётся. `event_key`: нет (см. gap G1) | Recipient берётся из строки cargo/trip, не из тела запроса |
| 2 | **bid_accepted** | `marketplace.py::accept_bid` (~line 2194–2199) | `bid_accepted` | ✅ | `bid.bidder_id` | `/cargos/{id}` или `/trips/{id}` или `/deals/{id}` | Естественный: статус `accepted` — терминальный, повторный accept → 409 | `require_level(1)` + проверка `owner_id == user.id` внутри `_finalize_accept_inline` |
| 3 | **deal_created** | Идёт как часть `bid_accepted` (`_finalize_accept_inline` создаёт deal и уведомляет одним push). Отдельный тип `deal_created` встречается только в counter-accept пути (`marketplace.py:2530`) | `bid_accepted` (обычно) / `deal_created` (counter-accept) | ✅ | bidder + owner (в counter-accept) | Same as #2 | Естественный: `deal` per bid уникален (`UNIQUE(bid_id)` не выставлен, но `_finalize_accept_inline` дедупит по `status='accepted'`) | Same as #2 |
| 4 | **chat_message** | `chat.py::send_message` (~line 374) | (нет отдельной in-app notification — см. Gap G2) | ✅ `send_to_user(kind="chat")` | `chat_rooms.participant_{1,2}` — та, что не отправитель | `/chats/{room_id}` + payload `{room_id, from_user_id, deal_id}` | Естественный: каждое сообщение = свой `chat_messages.id`. Клиент дедупит по client_msg_id | `chat_rooms` создаётся только участниками сделки; чужой не может слать в чужой чат |
| 5 | **chat_attachment** | `deal_room.py::upload_attachment` (~line 416) | (нет отдельной in-app — Gap G2) | ✅ `send_to_user` | Second participant of `chat_rooms` | `/chats/{conversation_id}` | Естественный: attachment id уникален | Проверка `require_level(1)` + `participant_1/2 == user.id` |
| 6 | **trip_started** = deal.status → `in_progress` | `marketplace.py::update_deal_status` (~line 2988) | `deal_status` (label `"🚛 Рейс начался"`) | ✅ | `deal.driver_id` или `deal.shipper_id` (кто не uid) | `/cargos/{id}` или `/trips/{id}` или `/deals/{id}` | `_transition_deal` идемпотентен: повторный переход в `in_progress` возвращает `None` payload → push не отправляется второй раз | `403` если `uid not in (shipper_id, driver_id)` |
| 7 | **gps_tracking_requested** | НЕТ отдельного backend endpoint (см. Gap G3). Frontend показывает permission dialog локально, не шлёт запрос на сервер | — | — | — | — | — | — |
| 8 | **gps_tracking_enabled/disabled** | НЕТ отдельного backend endpoint (Gap G3). GPS начинается ЛОКАЛЬНО на устройстве водителя при `deal.status=in_progress`; grant/deny нигде не пушится на сервер | — | — | — | — | — | — |
| 9 | **delivered_by_driver** = deal.status → `delivered` | `marketplace.py::update_deal_status` (line 2988) | `deal_status` (label `"✅ Доставлен — ожидается подтверждение получения"`) | ✅ | `deal.shipper_id` (по формуле "other") | Same as #6 | Same as #6 | Same as #6 |
| 10 | **received_by_shipper** = deal.status → `received` | `marketplace.py::update_deal_status` | `deal_status` (label `"✅ Получение подтверждено"`) | ✅ | `deal.driver_id` | Same as #6 | Same as #6 | Same as #6 |
| 11 | **deal_completed** = deal.status → `completed` | `marketplace.py::update_deal_status` | `deal_status` (label `"🤝 Сделка завершена"`) | ✅ | «other side» | Same as #6 | Same as #6 | Same as #6 |
| 12 | **deal_cancelled** = deal.status → `cancelled` | `marketplace.py::update_deal_status` | `deal_status` (label `"❌ Отменено"`) | ✅ | «other side» | Same as #6 | Same as #6 | Same as #6 |
| 13 | **bid_expired** | `marketplace.py::_maybe_expire_bid` (лениво в `accept_bid`/`update_bid`/`counter_bid`/`list_bids`) — landed in PR #309 | Не шлёт push (см. Gap G4) | — | — | — | — | Проверок нет — expire silent |

## Найденные gap'ы

Ни один из четырёх не блокирует релиз — но их надо закрыть **отдельными фокусными PR'ами**, а не размывать по этому audit-у.

### G1 — bid_created event_key
`event_key` не передаётся в `create_notification` для `bid_created`. Если
клиент случайно ретайнет POST /bids (сеть, spinner-race), приложение
уже отдаёт 409 `duplicate_bid` — так что push НЕ создастся дважды.
Дубль ловится на уровне бизнес-контракта, не на дедупе notifications.
Формально всё ок, но добавить `event_key=f"bid-created:{bid_id}"` не
повредит — сделает контракт бронебойным.

**Fix scope**: 1 файл, 1 строка.

### G2 — chat_message / chat_attachment без in-app notification
Chat push отправляется, но в `/api/v1/notifications` записи не создаётся.
Это **осознанное решение** (см. комментарии в `chat.py:722` — «одно
бизнес-событие ДВАЖДЫ» после Блока 5 аудита) — badge Сделок считает
непрочитанные chat сообщения отдельным путём через `chat_messages`.
Так что это **НЕ баг**, а по контракту. Live checklist это тоже
проверяет — Notifications-колокольчик НЕ должен показывать
входящие сообщения (они видны в списке чатов).

### G3 — gps_tracking_* backend endpoints НЕТ
GPS grant/deny/start/stop случается локально на устройстве водителя,
на бэкенд отправляется только координата в фоновом location task
(см. `src/utils/backgroundLocation.js`). Событий «водитель дал/отозвал
разрешение» бэкенд не видит. Push для «GPS выключен» не отправляется.

**Business decision**: нужно ли грузовладельцу узнавать «водитель
выключил GPS»? Если да — отдельный PR с endpoint `/deals/{id}/gps` +
push type `gps_status`. Пока — не обещаем.

### G4 — bid_expired push
`_maybe_expire_bid` (PR #309) лениво транзитит статус в `expired`, но
push водителю НЕ шлёт. Водитель увидит статус только когда откроет
CargoDetail и загрузит список ставок. С точки зрения бизнеса — тоже
осознанно (lazy transition = silent cleanup), но по ТЗ этой event matrix
требуется явный `bid_expired` push. Отдельный focused PR.

## Sources of truth (не смешивать)

- **In-app badge на «Сделки»** = `notifUnread + chatUnread` (см.
  `services/push_sender._compute_recipient_badge` и Блок 5 аудита в
  `chat.py:722`). Никаких «locally counted +1/-1» — badge всегда
  `COUNT(*) FROM notifications WHERE ...`. Атомарно к серверному
  состоянию.
- **Notifications tab source** = таблица `notifications`. Список читает
  через `/api/v1/notifications`.
- **Chats badge** = `chat_messages WHERE recipient_id = ? AND is_read = 0`,
  без учёта системных сообщений (те дублировали бы `deal_status`
  уведомление — см. Блок 5).

## Ownership contract

- Push дойдёт до `user_id` только через registered device token → см.
  `backend/api/push.py::_resolve_ownership`. Токен связан с `user_id`,
  чужой user через тот же device_id получает `409 conflict`.
- Notification создаётся с `user_id` жёстко из серверных строк
  (`cargos.owner_id`, `bid.bidder_id`, `deals.driver_id/shipper_id`) —
  клиент **не может** подделать recipient.

## См. также

- `backend/tests/test_notification_source_of_truth.py` — существующий
  suite на dedupe/event_key (10 тестов).
- `backend/tests/test_push_delivery_regressions.py` — регрессии на
  invalid Expo credentials, trip bid → driver push.
- `backend/tests/test_push_token_security.py` — 11 тестов на
  ownership/hijack/reclaim.
- `backend/tests/test_attachment_push.py` — chat_attachment push.
- `backend/tests/test_push_event_matrix.py` — **добавлен этим PR**,
  фиксирует всю матрицу выше как автоматический контракт.
- `qa/checklist/push-event-matrix-live.md` — **добавлен этим PR**, iPhone
  + Android чек-лист для реального устройства.
