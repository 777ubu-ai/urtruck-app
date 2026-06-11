# Chat E2E — Manual Real-Device Test Plan

> Этот план дополняет push-pipeline test. Цель: verify что chat flow между ролями (shipper ↔ driver) end-to-end работает на Build 29 на real iPhone.

---

## Pre-flight

- Phone A: client account (boris или новый user, role=client)
- Phone B: driver account (serik или новый user, role=driver)
- Один активный deal-room между ними (если нет — создать через Test 1)
- Wi-Fi или cellular (для real-time sync)

---

## Test 1: Создание deal-room (5 min, only if не существует)

**Steps:**
1. Phone A: Profile → «Опубликовать груз» → fill form → publish.
2. Phone B: Feed → найти этот груз → tap → «Сделать ставку» → 5000 KZT → confirm.
3. Phone A: получает push notification → «Новая ставка» → tap.
4. Phone A: в BidsList → tap на bid от Phone B → «Принять» → confirm.
5. **Result:** deal-room автоматически создан, оба user'a получают chat доступ.

**Pass criteria:** оба phone в Profile → Chats tab видят новый deal-room.

---

## Test 2: Partner name resolution (5 min) — Build 16/17 P0 fixes

**Цель:** убедиться что partner_name это real имя, а НЕ technical (`guest_abc`, null, partner_id).

**Steps:**
1. Phone A: tap Chats → tap на deal-room с Phone B.
2. Phone B: tap Chats → tap на deal-room с Phone A.

**Expected на Phone A:**
- Header: имя Phone B user'a (если у него есть `full_name` в DB), либо phone-tail `«+7****1234»` (Build 17 fallback).
- НЕ должно быть:
  - `null`
  - `undefined`
  - `guest_<hash>`
  - `Пользователь UrTruck` (это last-resort fallback — ОК если у user'a реально нет имени)
  - Чисто numbers (raw partner_id)

**Pass criteria:** ✅ both phones показывают partner с осмысленным заголовком.

---

## Test 3: Cross-device message sync (10 min)

**Цель:** message от A приходит к B в течение 5 sec (3s polling + render).

**Steps:**
1. Phone A: chat open → input → `«Тестовое сообщение 1»` → send.
2. Phone B: deal-room visible на screen (chat open).
3. Wait 5 sec.

**Expected на Phone B:**
- Message «Тестовое сообщение 1» появляется в chat thread без manual refresh.
- Timestamp правильный (текущее время локали).

**Pass criteria:** ✅ message sync ≤ 5 sec.

---

## Test 4: Optimistic UI (5 min) — Build 17 P0-4

**Цель:** message появляется на отправителе СРАЗУ (до server confirm).

**Steps:**
1. Phone A: turn off Wi-Fi (cellular too if real test) — simulate slow network.
2. Phone A: chat → input → `«Optimistic test»` → send.
3. **Immediately** (≤500 ms) посмотреть на chat thread.

**Expected:**
- Message появляется в bubble **сразу** (с pending visual? — opacity 50% / clock icon).
- После того как network восстановится → message «confirms» (full opacity).
- Если network не восстановится в N секунд → красный кружок «не доставлено».

**Pass criteria:** ✅ message visible сразу + final state correct после reconnect.

---

## Test 5: KeyboardAvoidingView (5 min) — Build 15 P0

**Цель:** input не уходит под keyboard.

**Steps:**
1. Phone A: chat → tap input → keyboard поднимается.
2. **Verify visually:** input box + send button visible above keyboard.
3. Type a long message (3-4 строки).
4. Keyboard adapts — input box растёт, всё ещё visible.

**Expected:** ✅ input + send button ALWAYS visible выше keyboard.

**Pass criteria:** visual check — input не overlap'нул keyboard.

---

## Test 6: Translate-in-chat 🌐 (10 min) — Build 15 feature

**Цель:** translate button работает для перевода сообщений на другие языки.

**Steps:**
1. Phone A: settings → switch language to English.
2. Phone A: open chat where Phone B's last message is на Russian.
3. Tap 🌐 button рядом с сообщением.

**Expected:**
- Status: `«Translating...»` (1-2 sec)
- Replaces text with English translation.
- Tap «Show original» → возврат к Russian.

**Pass criteria:** ✅ translate работает, fallback на original.

**N/A если:** backend Google Translate API key отсутствует — это документировано как backend gap.

---

## Test 7: Cargo / route / deal meta header (5 min) — D2 fix PR #100

**Цель:** header чата показывает context груза + route.

**Steps:**
1. Phone A: open chat с Phone B.
2. **Look at header area** under partner name.

**Expected:**
- `Груз: <название>`
- `Маршрут: <откуда> → <куда>`
- `Ставка: <amount> KZT`

**Pass criteria:** ✅ deal-meta показывается с правильными данными.

---

## Test 8: Driver tabs preserved + Chat accessible (5 min) — driver-flow-cleanup

**Цель:** driver tab-bar = 5 вкладок, Chats — отдельная вкладка (НЕ спрятан в Profile).

**Steps:**
1. Phone B (driver): Profile → log out → log in.
2. Look at bottom tab bar.

**Expected:** 5 tabs visible:
- `Грузы` (Feed)
- `Мои рейсы` (MyWork)
- `Очередь` (Queue)
- `Чаты` (Chats) ← center, regular tab
- `Профиль` (Profile)

**Pass criteria:** ✅ Чаты — отдельная вкладка, доступна одним tap'ом.

---

## Test 9: Deep-link от push tap (10 min) — Build 17 P0-4

**Цель:** tap на push notification → app opens directly to правильный chat room.

**Steps:**
1. Phone B: full-quit app (swipe up).
2. Phone A: send message в chat с Phone B.
3. Phone B: lock-screen → tap notification.

**Expected:**
- App launches.
- After splash → directly opens **right** chat room (НЕ Main → Profile → Chats → manual tap).
- Last message visible.

**Pass criteria:** ✅ direct nav < 3 sec from tap to chat visible.

---

## Failure escalation

Если test FAIL — что проверить:

| Test | Failure check |
| --- | --- |
| 2 | `SELECT id, full_name, phone FROM users WHERE id = '<partner_id>'` — есть ли name? |
| 3 | Phone B `loadMessages` polling activated? Console log `[chat] poll tick` каждые 3s. |
| 4 | Optimistic UI — check ChatScreen.js line 363 (state update) до server call. |
| 5 | KeyboardAvoidingView wrap'нут с правильным behavior= per Platform. |
| 6 | Backend `/chat/translate` endpoint reach able? curl с auth. |
| 7 | `chatAPI.getRoom(room_id)` returns deal_id + cargo info? |
| 8 | `MainTabs` driver tab list = `[Feed, MyWork, Queue, Chats, Profile]`. |
| 9 | App.js useEffect для `addNotificationResponseReceivedListener` подключен? `navigateFromUrl` doesn't crash on missing URL? |

---

## Summary card (заполни после теста)

| Test | Status | Notes |
| --- | --- | --- |
| 1. Создание deal-room | ☐ PASS / ☐ FAIL | |
| 2. Partner name resolution | ☐ PASS / ☐ FAIL | |
| 3. Cross-device sync | ☐ PASS / ☐ FAIL | |
| 4. Optimistic UI | ☐ PASS / ☐ FAIL | |
| 5. KeyboardAvoidingView | ☐ PASS / ☐ FAIL | |
| 6. Translate 🌐 | ☐ PASS / ☐ FAIL / ☐ N/A | |
| 7. Deal meta header | ☐ PASS / ☐ FAIL | |
| 8. Driver tabs preserved | ☐ PASS / ☐ FAIL | |
| 9. Deep-link от push | ☐ PASS / ☐ FAIL | |

**Time required:** ~60 min.
**Critical:** 2, 3, 5, 9 (Build 15/16/17 fixes).
**Non-critical:** 1, 4, 6, 7, 8 (regression).
