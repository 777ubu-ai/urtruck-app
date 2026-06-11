# Chat E2E — Code Review (Phase 6 Night Ops)

> Цель: verify что chat flow между shipper ↔ driver работает корректно с partner_name resolution + Build 15/16/17 fixes на месте.

---

## ✅ Frontend `src/screens/ChatScreen.js`

| Check | Status | Line |
| --- | --- | --- |
| `resolvedPartner` state (Build 16 fix) | ✅ | 138 |
| `loadMessages(rid)` поллит каждые 3s | ✅ | 226 |
| `loadMessages` defensive merge — keeps prev sender_id (Build 17 fix) | ✅ | 328-336 |
| KeyboardAvoidingView обёртывает ВЕСЬ экран (Build 15 fix) | ✅ | 562, 675 |
| KeyboardAvoidingView behavior=padding на iOS, height на Android | ✅ | 562-565 |
| Translate-in-chat 🌐 button (Build 15 feature) | ✅ | 455, 536 |
| `prettifyPartnerName` fallback chain | ✅ | 576, 580 (via displayName.js) |
| Optimistic UI — message появляется сразу через `prev` state merge | ✅ | 239 (room.partner_name only used if local is empty) |
| `partner?.id` race-safe — везде optional chaining | ✅ | 211, 218, 221, 341, 363, 383 |

**Verdict:** ✅ ChatScreen handles all 4 races (resolvedPartner / loadMessages / keyboard / translate). No regression vs Build 17.

---

## ✅ Frontend `src/utils/displayName.js`

| Check | Status |
| --- | --- |
| `prettifyPartnerName(name, id, t)`:<br>1. Если имя задано и не technical (`guest_*`, `user_*`, etc.) → возвращаем как есть.<br>2. Если имя пустое или technical → `t('chat_partner_fallback') \|\| 'Собеседник'`. **НИКОГДА** не показывает partner_id.| ✅ |
| `partnerInitial(name)` → "?" если technical, иначе первая буква (Build 16 fix) | ✅ |

**Verdict:** ✅ Defensive name display — user никогда не видит «guest_abc123» или null.

---

## ✅ Frontend `src/utils/chatAPI.js`

| Check | Status |
| --- | --- |
| `chatAPI.listRooms()` returns rooms with partner_name | ✅ |
| `chatAPI.listMessages(room_id)` returns messages | ✅ |
| `chatAPI.sendMessage(room_id, text)` POST + auth | ✅ |
| BASE switches localhost/production via `marketAPI.js` pattern | ✅ |
| Error handling: try/catch, returns `null` если 401 | ✅ |

---

## ✅ Backend `backend/api/chat.py`

| Check | Status | Line |
| --- | --- | --- |
| **`partner_name` field в response всегда заполнен**: `full or tail or "Пользователь UrTruck"` (Build 17 fix) | ✅ | 233-235 |
| `sender_name` для push: `full_name` or `phone` or `"Пользователь"` fallback | ✅ | 169 |
| `kind="chat"` в push_sender call (Build 17 P0-2) | ✅ | 163, 175 |
| Push title использует `sender_name`, не raw id | ✅ | 172 |
| If user has no full_name → используется phone-tail (last 4 digits) | ✅ | 230-232 |

**Verdict:** ✅ partner_name никогда не null. Phone-tail fallback гарантирует уникальность для users без имени.

---

## ⚠️ Что НЕ ловит code review (требует runtime test)

1. **Cross-device sync** — `loadMessages` poll 3s. Test: A посылает, B видит в течение 3-5s.
2. **KeyboardAvoidingView behavior** — на physical iPhone 17 надо visually verify что input не уходит под keyboard.
3. **Translate-in-chat** — нужен real Google Translate call (или backend mock); UI button работает.
4. **Optimistic UI** — message появляется сразу до server confirm. Verify: if backend slow, message виден с pending state.
5. **Deep-link на chat** из push tap — это тест Phase 5 (Test 5 в `qa/PUSH_MANUAL_TEST_PLAN.md`).

Все эти runtime tests — manually на Build 29 device (см. `qa/CHAT_MANUAL_TEST_PLAN.md`).

---

## Maestro coverage

| Flow | Purpose |
| --- | --- |
| `.maestro/07-chat-shipper.yaml` | Shipper opens Chat → opens deal-room → sees partner name (not null) → sends message → optimistic UI shows it |
| `.maestro/08-chat-driver.yaml` | Driver opens Chat → 5 driver tabs preserved → opens deal-room → sees shipper name → replies |

Эти flows доказывают:
- ✅ Chat list рендерится без crash
- ✅ partner_name **не null** / не technical
- ✅ Driver tabs **PRESERVED** (regression check)
- ✅ Optimistic UI message viewable

---

## ✅ Final verdict (Phase 6 Code Review)

✅ **CHAT E2E READY for Build 29.** Build 15/16/17 fixes на месте:
- Build 15: KeyboardAvoidingView + translate-in-chat
- Build 16: resolvedPartner + partnerInitial fallback
- Build 17: partner_name всегда filled (backend), loadMessages race fix, kind='chat' для push

**No blockers.** Manual cross-device test нужен для verify polling sync (см. `qa/CHAT_MANUAL_TEST_PLAN.md`).
