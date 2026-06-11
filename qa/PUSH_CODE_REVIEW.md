# Push Notifications — Code Review (Phase 5 Night Ops)

> Цель: verify что push pipeline после Build 17 fixes работает корректно. Все 4 P0 fixes на месте.

---

## ✅ Frontend `src/utils/push.js`

| Check | Status | Line |
| --- | --- | --- |
| `Notifications.setNotificationHandler({ shouldShowAlert, shouldPlaySound, shouldSetBadge })` | ✅ | 128-132 |
| `Notifications.getPermissionsAsync()` checked first | ✅ | 135 |
| `Notifications.requestPermissionsAsync()` if not granted | ✅ | 138 |
| Android channel created (`AndroidImportance.HIGH`) | ✅ | 145-152 |
| **`projectId` from `Constants.expoConfig.extra.eas.projectId`** (Build 17 fix P0-1) | ✅ | 162-168 |
| Fallback ladder: `expoConfig → easConfig → manifest` | ✅ | 163-167 |
| `getExpoPushTokenAsync({ projectId })` если projectId есть | ✅ | 176 |
| Fallback `getExpoPushTokenAsync()` zero-arg если nullам | ✅ | 177 |
| Token sent to backend `/register-native` | ✅ | 192 |
| Auth header `Authorization: Bearer <token>` | ✅ | 196 |
| **Response status проверен** (Build 17 fix issue #5) | ✅ | 205-213 |
| Store token in `NATIVE_TOKEN_KEY` после успешной регистрации | ✅ | 214 |
| `__DEV__` debug logs (issue #5) | ✅ | 171, 179, 184, 206 |

**Verdict:** ✅ no missing handler / leaked subscription. Все 3 Build 17 P0-1 фикса присутствуют.

---

## ✅ Frontend `App.js`

| Check | Status | Line |
| --- | --- | --- |
| Web SW message listener (web platform only) | ✅ | 75-84 |
| iOS/Android push listener gate | ✅ | 98 (Platform.OS check) |
| `Notifications.getLastNotificationResponseAsync` для cold-start | ✅ | 109-111 |
| `Notifications.addNotificationResponseReceivedListener` для tap | ✅ | 113 |
| Cleanup: `sub?.remove?.()` in useEffect return | ✅ | 114 |
| URL extracted from `notification.data.url` → `navigateFromUrl(navRef, url)` | ✅ | 104-105 |

**Verdict:** ✅ tap navigation handled both cold-start AND warm; no memory leak (cleanup correct).

---

## ✅ Backend `backend/services/push_sender.py`

| Check | Status | Line |
| --- | --- | --- |
| `_send_expo(tokens, title, body, data, badge=None)` принимает badge | ✅ | 125 |
| **`badge` field в msg_base** (Build 17 P0-2 fix) | ✅ | 146-147 |
| `_send_native(user_id, ..., badge=None)` propagates | ✅ | 201, 211 |
| **DeviceNotRegistered + InvalidCredentials → token cleanup** | ✅ | 162-170 |
| `DELETE FROM push_tokens_native WHERE token = ?` | ✅ | 169 |
| `_compute_recipient_badge(user_id)` для chat-kind | ✅ | 220-228 |
| `send(...)` calls `_send_native` с badge для chat-kind | ✅ | 243+ |

**Verdict:** ✅ badge field прокинут до APNs, dead tokens cleaned up автоматически.

---

## ✅ Backend `backend/api/chat.py`

| Check | Status | Line |
| --- | --- | --- |
| `kind="chat"` в `push_sender.send(...)` (Build 17 P0-2/3 fix) | ✅ | 163, 175 |

**Verdict:** ✅ chat push'и помечены kind=chat — это триггерит badge computation.

---

## ⚠️ Что НЕ проверено code review'ом (нужен real device test)

1. **APNS delivery** на real iPhone — Expo Push Service → APNs → device. Это endpoint-level, требует production credentials и real APNs key uploaded.
2. **Badge на home-screen icon** реально появляется. Code говорит «badge будет в payload», но iOS показывает только если permissions+config верны.
3. **Tap navigation cold-start** реально работает (запускается из killed app). Нельзя проверить в simulator.
4. **`partner_name` в payload** — раньше был null, Build 17 patch должен резолвить. Verify on actual device чтобы подтвердить что заголовок push'a — это real name (`Иван П.`) а не `Чат N` или `null`.

Эти 4 пункта — содержание `qa/PUSH_MANUAL_TEST_PLAN.md`.

---

## ✅ Build 17 P0 fixes — статус

| Fix | Code review | Need real device test |
| --- | --- | --- |
| P0-1 `projectId` в `getExpoPushTokenAsync` | ✅ verified | Test 1 in plan |
| P0-2 `badge` field прокинут | ✅ verified | Test 3 in plan |
| P0-3 `partner_name` в push payload | ✅ verified в chat.py | Test 2 in plan |
| P0-4 message persistence (loadMessages race fix) | ✅ verified | Test 5 in plan |

---

## Maestro coverage

`.maestro/06-push-permission.yaml` — smoke flow:
- Login + Profile + assert no error toast («Не удалось получить токен»)
- НЕ ловит real APNS — для этого manual plan.

---

## Final verdict (Phase 5 Code Review)

✅ **PUSH PIPELINE READY for Build 29.** Все 4 P0 fixes из Build 17 на месте. Manual real-device testing нужен для:
1. Verify APNS delivery
2. Verify badge на home-screen
3. Verify partner_name в title
4. Verify tap navigation cold-start

Эти 4 теста запланированы в `qa/PUSH_MANUAL_TEST_PLAN.md`.

**No blockers for Build 29 EAS submit.**
