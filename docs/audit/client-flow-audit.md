# UrTruck — Client/Shipper flow audit (2026-06-10, post Build 26)

Контекст: реальное тестирование Build 26 в TestFlight + бэкенд-curl reproduction.
Цель: разблокировать клиентский сценарий **Создать груз → ставки → водитель → принять → чат**.

## Сводный список (severity)

| ID | Sev | Зона | Воспроизведение |
| --- | --- | --- | --- |
| **B1** | P0 | «Мои грузы» вкладки | Cargo попадает одновременно в «Активные» (`my_cargos` без фильтра по status) И в «Архив» (`my_deals` без фильтра по status); accepted deals ошибочно в архиве |
| **B2** | P1 | Accept → Chat «Собеседник» | `POST /market/bids/{id}/accept` отдаёт только `{ok, deal_id, chat_room_id}`. Frontend не имеет имени водителя для navigation params → chat header показывает «Собеседник» |
| **B3** | P1 | Open-chat → Chat «Собеседник» | `POST /market/bids/{id}/chat` (для pending/countered bid) отдаёт только `{ok, chat_room_id}`. Та же проблема |
| **B4** | P1 | Bid card неинформативна | CargoDetail bid card: рендерит только `name`, `rating`, `amount`, `message`, `status`. Нет телефона (`bidder_phone` отдаётся, но не показывается), нет role-badge «Водитель», нет verification level, нет визуального якоря для понимания «это реальный кандидат» |
| **B5** | P2 | ChatScreen без partner в params | Когда переход в Chat идёт через cargo→bid→openChat, params содержат `roomId+role` без partner. ChatScreen ничего не подтягивает с backend для заполнения header'а (есть `marketAPI.getDeal(dealId)`, но если нет dealId — header пуст) |
| **B6** | P2 | Yandex маршрут не находит города | `RouteMap.openYandex` парсит city как `str.split(',')[0].trim()`. При наличии «Хоргос 🇨🇳» или «Алматы, Казахстан» — emoji/флаги/страна попадают в lookup ключ, CITIES dict не находит → text-search fallback часто промахивается |
| B7 | P3 | Chat статус `ACCEPTED` латиницей в RU | Известно из предыдущих аудитов (D16) |
| B8 | P3 | Bell badge polling 30s | Не real-time. Документировано в audit. |
| B9 | P3 | Push: registerForPushNotifications не вызывается на cold start без user action | `push.autoRegister()` ждёт пермишен от юзера — корректно для Apple. Но bell badge polling 30s — единственный механизм пока push не доставлен. **REAL DEVICE ONLY** для проверки APNS |

## Детализация по фазам (PHASE 1 audit notes)

### Onboarding / Login / OTP / Registration
- Проверены ранее в PR #98-101. Гард `QA_HOOK_ALLOWED`, реальный OTP не тронут. ✅
- Onboarding V2 — 3 slide carousel + 2 CTA. Без проблем.

### Profile / Profile editing
- Driver profile clean (D1 fix landed PR #100).
- EditProfile title — D19 (P2 known, требует `theme.text` вместо `v1Colors.text`).
- Push filter screen — 6 категорий, фильтр грузов. Чисто.

### Cargo creation (CreateCargoScreen)
- Форма полная: from/to/desc/truck/date/weight/volume/payment/photo. ✅
- D6 (placeholder «22»/«110») известно, P2.

### Cargo details (CargoDetail)
- **B4**: bid card минимальная. Будет переработана. См. ниже.

### Bids (CargoDetail._renderBidCard)
- **B4** + **B5**: проброс partner в navigation отсутствует.

### Driver marketplace (FeedScreen)
- Фильтры Направление/Дата/Кузов работают через `marketAPI.listCargos({fromCity, toCity, cargoType})`.
- Цена → только локальный sort (backend не поддерживает фильтр по цене).
- Поиск — frontend client-side.
- Тех. долг: filter sheet'ы отдельные per filter, неочевидно, что выбрано. Не блокер, но UX-минус. → P2.

### Chats (ChatsListScreen)
- `/chat/rooms` отдаёт полный rich payload (partner_id, partner_name, partner_role, route_label, cargo_title, bid_amount, last_message, unread). ChatsListScreen рендерит чисто. ✅

### ChatScreen
- **B2/B3/B5**: при переходе из CargoDetail или после accept — partner не передаётся.

### Notifications / Push / Unread
- In-app unread badge: ✅ `bottom-nav-chats-badge` poll 30s, корректно появляется/исчезает.
- Push registration: реализован `expo-notifications.getExpoPushTokenAsync` + `POST /api/v1/push/register-native`, но требует пермишен. **REAL DEVICE ONLY** для APNS proof.

### Filters
- backend поддерживает: `from_city`, `to_city`, `cargo_type` (LIKE-фильтрация).
- Не поддерживает на backend: `price_min/max`, `rating`, `verified_only`.
- Frontend делает дополнительный client-side filter + sort.

### Maps (RouteMap)
- **B6**: parsing weak. Будет исправлен.

### Archived items
- См. B1.

### Active items
- См. B1.

## Что фиксится в этом PR

| ID | Решение |
| --- | --- |
| B1 | `MyTripsScreen.js` для client: «Активные» = `my_cargos.filter(status='active' && !expired)`, «В работе» = `my_cargos.filter(status='taken')` + bonus stats, «Архив» = `my_cargos.filter(status in completed/cancelled/expired)` |
| B2/B3 | Backend `marketplace.py`: `accept_bid` + `open_chat_for_bid` обогащаются `partner_id` + `partner_name` + `partner_role` (минимум для chat header) |
| B4 | `CargoDetail.js`: bid card получает доп. строки — телефон если есть, role-badge «Водитель», подсветка bid с фокусом «реального кандидата» |
| B5 | `ChatScreen.js`: если params.partner.name пуст и есть roomId — дотягиваем `/chat/rooms` и берём `partner_id/name/role/route_label/cargo_title` из этого room'а |
| B6 | `RouteMap.openYandex` + `_cityKey` helper — жёсткая очистка emoji/flags/punctuation перед lookup'ом |
| B7-B9 | НЕ исправляется в этом PR. P3 backlog. |

## Что НЕ фиксится (вне scope этого PR)

- Filter overhaul (B-feed) — отдельный design pass.
- Push APNS proof — нужен реальный iPhone.
- ACCEPTED латиница — P3, batched UX-PR.
- EditProfile title fade — D19 P2 уже в backlog.
