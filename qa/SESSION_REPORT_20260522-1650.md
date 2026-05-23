# Session Report — 2026-05-22 16:50 UTC

**Ветка:** `claude/fix-feedscreen-mycargo-render`
**Base:** `origin/release/appstore-rc1` (= e0c7a64 = TestFlight build 13 source)
**HEAD:** `f343688`
**Коммитов в этой сессии:** 4 кодовых (поверх 8 из предыдущих)
**Всего на ветке:** 12 коммитов

## 1. Коммиты этой сессии

| Hash | Описание |
|---|---|
| `ad033b2` | fix(bidmodal): currency-aware chips + KeyboardAvoidingView wrapping (P0 #1 + #2) |
| `978466c` | fix(notifications): hide 'None предлагает' from display (P0 #4) |
| `f343688` | fix(cargo-detail): recompute isMine after server fetch (P0 #5) |
| `7ca62fe` | docs(qa): предыдущий отчёт (history) |

## 2. P0 / P1 status

| ID | Симптом | Status | Закрыт коммитом |
|---|---|---|---|
| **P0 #1** | BidModal keyboard hides inputs | ✅ **closed** | `ad033b2` — KeyboardAvoidingView (iOS padding / Android height) + ScrollView keyboardShouldPersistTaps |
| **P0 #2** | Quick-prices $0/$200/$400 на «По договорённости» | ✅ **closed** | `ad033b2` — currency-aware deltas (KZT +50k/+100k, RUB +20k/+40k, USD/CNY +200/+400), default currentPrice=0, sym через CURRENCY_SYMBOLS |
| **P0 #3** | Чаты не работают как чаты (нет rooms между shipper/driver) | ⚠️ **partial / needs data** | См. ниже — код корректен, требуется backend / data investigation |
| **P0 #4** | «None предлагает $X» в нотификациях | ✅ **closed (display)** | `978466c` — cleanNotifText display-time replace. Реальный фикс — на backend (см. §3) |
| **P0 #5** | Нет UI для Accept/Reject/Counter/Chat на ставках | ✅ **closed** | `f343688` — UI ВСЕГДА был в коде (CargoDetail:433-491), но c.isMine терялся после server fetch. Recompute из owner_id |
| **P1 #6** | «+ Разместить груз» в правом верхнем углу | ✅ **closed in code** | `f101985` (предыдущая сессия) — закомментирована. User видит на iPhone build 13 = старый билд, моих коммитов там нет |

## 3. Backend blockers / что требует backend изменений

### Backend BL-1 — `user.get('full_name', 'Водитель')` antipattern

**Файл:** `backend/api/marketplace.py:686, 716` + similar callsites в `accept_bid`/`reject_bid`/`counter_bid` (lines ~1049-1131).

**Что нужно:**
```python
# Сейчас:
text = f"{user.get('full_name', 'Водитель')} предлагает ${body.amount} ..."

# Должно быть:
text = f"{user.get('full_name') or 'Водитель'} предлагает ${body.amount} ..."
```

В Python `dict.get(key, default)` возвращает `default` только при отсутствии ключа. Если значение явно `None` (что у большинства пользователей), `.get()` вернёт `None`, и f-string интерполирует литерал `"None"`.

**Текущая защита:** `978466c` чистит `"None предлагает"` на frontend display. Но новые notifications продолжают писаться с "None" в `notifications.text`. Backend fix — реальное решение.

### Backend BL-2 — `bidder_name` тоже подвержен той же проблеме

**Файл:** `backend/api/marketplace.py:660` (create_bid INSERT):
```python
c.execute("INSERT INTO bids (... bidder_name, bidder_phone, ...)
          VALUES (...,?,?,...)",
          (..., user.get("full_name"), user.get("phone"), ...))
```

Если `full_name=None`, в БД пишется NULL → ОК (фронт делает `bidder_name || bidder_phone || t('anonymous')` fallback).

Но если бэкенд где-то делает `user.get('full_name', 'fallback')` и full_name=None — будет та же проблема. Audit recommended.

### Backend BL-3 — Currency не передаётся в notification

**Файл:** `backend/api/marketplace.py:685-686`:
```python
title = f"💰 Новое предложение ${body.amount}"
text = f"... предлагает ${body.amount} за {from_city}→{to_city}"
```

`$` hardcoded в notification text. Cargo с price в KZT/RUB/CNY получает уведомление в USD. Backend должен либо включать currency в title/text, либо передавать как separate field в notification payload.

**Текущее состояние:** не закрыто. Это user-visible баг для не-USD грузов. Требует backend.

### Backend BL-4 — Eager chat_room / chats list debugging

**Файл:** `backend/api/marketplace.py` (PR-B `_ensure_chat_room_inline`) + `backend/api/chat.py:180-212` (`/rooms` endpoint).

**Симптом (frontend):** в ChatsListScreen user видит только Поддержку + один старый диалог «Бауржан», но не видит rooms между ним и драйверами/шипперами, которые сделали ставки на его cargo/trip.

**Frontend код корректен** (проверено в `src/screens/ChatsListScreen.js:79-90`):
```js
const [roomsRes, contactsRes] = await Promise.all([
  chatAPI.rooms(),
  fetch(`${API_BASE}/chat/contacts`).then(r => r.json()),
]);
setRooms(roomsRes.rooms || []);
```

Возможные backend issues:
1. `_ensure_chat_room_inline` silently failed (PR-B обернул в try/except, см. marketplace.py:704)
2. `user.id` в session не совпадает с `bidder_id` или `owner_id` записанным в bid'е
3. `chat_rooms` table миссинг для prod (PRAGMA migration не сработала)
4. `/chat/rooms` SELECT не находит rooms потому что participant_1/_2 sort order инвертирован

**Что нужно сделать:**
- SSH на VPS → `sqlite3 /home/ubuntu/urtruck-security/database/security.db "SELECT COUNT(*) FROM chat_rooms WHERE participant_1 = '<user_id>' OR participant_2 = '<user_id>'"` для проверки сколько rooms на самом деле существует для конкретного user.
- pm2 logs → искать exception от `_ensure_chat_room_inline`
- ИЛИ — добавить admin endpoint `/api/v1/admin/chat-rooms?user_id=...` для inspection

**Я не могу это сделать** — нет SSH, нет admin token. Это backend team job.

## 4. P0 #3 (Chats) — детальная диагностика

### Что я проверил

| Слой | Состояние | Confidence |
|---|---|---|
| Backend schema `chat_rooms` | существует, имеет (participant_1, participant_2, cargo_id, trip_id, last_at) | high |
| Backend `_ensure_chat_room_inline` (PR-B e94c1ac) | идемпотентен, sorted pair lookup, INSERT если нет | high (статически review'нул) |
| Backend `/chat/rooms` endpoint | существует, SELECT по participant_1/_2 OR | high |
| Backend `/chat/rooms` response shape | `{rooms: [{...}], }` | high |
| Frontend `chatAPI.rooms()` | корректный fetch + JSON parse | high |
| Frontend `ChatsListScreen` отрисовка | rooms map, renderRoom с partner_name/last_message/unread | high |
| **Eager chat_room create runtime** | **unknown** — без логов или SQL не подтверждается | low |

### Что в коде идеально работает (если данные есть)

- После bid → backend пытается `_ensure_chat_room_inline` (внутри `with get_conn()`)
- chat_room записывается с (sorted(bidder_id, owner_id), cargo_id, NULL) для cargo-bid
- Owner открывает Chats → `chatAPI.rooms()` → backend SELECT → возвращает room
- Frontend рендерит row с partner_name (или fallback через prettifyPartnerName)
- Tap → navigate Chat → загружается message history

### Что код не делает

- Нет UI-кнопки «Открыть чат» в ChatsListScreen для создания нового диалога **с нуля** (без существующего bid). Это by design: chat возможен только после ставки (правило marketplace).
- Нет toast/error если `chatAPI.rooms()` упал — silent catch. Это можно улучшить, но не критично.

### Минимальный фикс не требуется (код корректен)

Frontend не нужно править для P0 #3. Это data / backend investigation. Если backend подтвердит что rooms реально создаются для bid'ов user'а — frontend их покажет.

## 5. Готов ли код для нового EAS preview build?

### ✅ ДА — все code-fixable блокеры закрыты

| Feedback | Закрыто кодом? |
|---|---|
| P0 #1 BidModal keyboard | ✅ KeyboardAvoidingView |
| P0 #2 quick-prices $0 + currency | ✅ Currency-aware + guard |
| P0 #3 Чаты не работают | ⚠️ Код корректен, нужна data investigation |
| P0 #4 «None предлагает» | ✅ Display-time clean (но реальный fix — backend) |
| P0 #5 нет Accept/Reject UI | ✅ c.isMine recompute после server fetch |
| P1 #6 «+ Разместить груз» leftover | ✅ Закомментировано (предыдущий коммит) |

### Оставшиеся блокеры до полного marketplace flow

- **Backend BL-1** (None в notifications) — display fixed, real fix backend
- **Backend BL-3** (currency в push notification text) — пользователь увидит "$ X" в push на не-USD cargo
- **Backend BL-4** (debug chat_rooms data) — нужна prod SQL/logs проверка

## 6. Что обязательно проверить руками после нового build 14

### Сценарий 1 — BidModal keyboard (iPhone)
1. Открыть cargo с price=0 (negotiable) → тап «Предложить цену»
2. Тап в поле «Своя цена» → keyboard поднимается
3. **Ожидание:** Sheet с input'ами лифтится наверх; input «Своя цена» виден; submit button «Отправить ставку» доступна (можно доскроллить если не помещается)
4. **Не ожидается:** input скрыт за keyboard

### Сценарий 2 — Currency-aware chips
1. Cargo с price=700000 currency=KZT → тап «Предложить цену»
2. **Ожидание chips:** `700 000 ₸ / 750 000 ₸ / 800 000 ₸` (символ ₸, не $)
3. Subtitle: `avgPrice: 650 000 ₸–800 000 ₸` (тоже ₸)
4. Input prefix: `₸` слева от поля ввода
5. Та же проверка для USD/RUB/CNY cargo'ов

### Сценарий 3 — Negotiable bid
1. Cargo с price=0 или null → тап «Предложить цену»
2. **Ожидание:** chips НЕТ совсем; subtitle «По договорённости»; только input с currency-aware символом

### Сценарий 4 — Bid lifecycle на CargoDetail
1. Owner cargo с входящими ставками → открыть через «Мои грузы» → CargoDetail
2. **Ожидание для каждой pending ставки:** 4 кнопки в строке:
   - 🚫 «Отклонить» (rejectBtn outline red)
   - 🔁 «Контр-предложение» (miniBtn outline orange)
   - 💬 «Открыть чат» (miniBtn outline green)
   - ✅ «Принять» (acceptBtn filled green)
3. **Также для bidder-side:** свои pending bids имеют Edit / Discount / Cancel / Open chat
4. **Не ожидается:** ставки рендерятся БЕЗ action кнопок

### Сценарий 5 — Notifications cleanup
1. Открыть Notifications screen
2. **Ожидание:** Старые ставки показывают «Водитель предлагает $X» (вместо «None предлагает $X»)
3. **Не ожидается:** литерал «None» в начале сообщения

### Сценарий 6 — Title-row CTA отсутствует
1. Главная Feed (Рейсы tab)
2. **Ожидание:** заголовок «Машины» (или «Грузы»), подзаголовок, **БЕЗ orange кнопки «+ Разместить груз» справа сверху**
3. Большой floating «+» в центре BottomNav остаётся
4. **Не ожидается:** title-row кнопка

### Сценарий 7 — Chats после bid (для backend investigation)
1. Driver делает bid на cargo шиппера
2. Через 30 sec оба должны увидеть room в Chats list
3. **Если НЕ видят:**
   - Driver на iPhone: «💬 Открыть чат» на своей ставке → должен открыть Chat screen
   - Если нет — chat_room не создалась, нужна backend проверка SQL

### Регрессионные проверки (не должно сломаться)
- [ ] Тап на свой cargo в «Мои грузы» → CargoDetail в owner-режиме (без «Предложить цену», есть accept/reject UI)
- [ ] Тап на чужой cargo в Feed → CargoDetail в driver-режиме (есть «Предложить цену»)
- [ ] Создание cargo → нет поля «Комментарий», есть defaultOpen DatePicker, нет двойной строки даты
- [ ] Создание trip → то же
- [ ] Гость тапает «+» в BottomNav → backend 403 → читаемый toast, не белый экран
- [ ] Уведомление с url `/cargos/X?bid=Y` → тап → CargoDetail с подсветкой
- [ ] Уведомление с url `/trips/X?bid=Y` → тап → TripDetail
- [ ] Уведомление с url `/deals/X` → тап → ChatsList (fallback)

## 7. Diff scale всей ветки

```
src/components/BidModal.js         | +63 / -10
src/components/DatePicker.js       | +14 / -2
src/components/Toast.js            | +15 / -2
src/screens/CargoDetail.js         | +15 / -2
src/screens/CreateCargoScreen.js   | +20 / -10  (PR-C1 + onClose)
src/screens/CreateTripScreen.js    | +14 / -10
src/screens/FeedScreen.js          | +44 / -28
src/screens/NotificationsScreen.js | +95 / -6
src/screens/registration/PremiumProfileScreen.js | +24 / -4
src/utils/AuthContext.js           | +31 / -2
src/utils/marketAPI.js             | +27 / -13
src/utils/registration.js          | +21 / -2
qa/AUTONOMOUS_QA_REPORT_*.md       | +234
qa/SESSION_REPORT_*.md             | this file
```

**Backend / app.json / eas.json / package.json:** не тронуты во всех 12 коммитах ветки.

## 8. Финальное состояние

- Branch `claude/fix-feedscreen-mycargo-render` запушена в `origin/`
- `git status` чист
- `npm run build:web` exit 0 после каждого коммита
- 12 коммитов поверх rc1, готовы к EAS build 14

**STOP. Жду EAS preview build 14 + ручную проверку владельца + decision по backend BL-1..BL-4.**
