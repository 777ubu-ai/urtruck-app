# Push Notifications — Manual Real-Device Test Plan

> Этот план Шеф выполнит на iPhone после установки Build 29 в TestFlight.
> Цель — подтвердить что 4 P0 фикса Build 17 (projectId, badge, partner_name, message persistence) реально работают на iOS hardware.

---

## Pre-flight

- Two test accounts (Phone A + Phone B либо Phone + Simulator):
  - **Phone A:** грузоотправитель (`boris` или новый client account)
  - **Phone B:** водитель (`serik` или новый driver account)
- Build 29 установлен через TestFlight на iPhone (real device, NOT simulator — APNS не работает в simulator).
- Backend `185.22.65.11:8001` доступен (curl http://185.22.65.11:8001/api/v1/system/info → 200).
- Apple Push Notification Service available (Wi-Fi или cellular).

---

## Test 1: Permission prompt + token register (5 min) — P0-1

**Цель:** iOS system permission popup появляется + Expo Push Token регистрируется на backend.

**Steps:**
1. Если app установлен — delete + reinstall (fresh install)
2. Open UrTruck app
3. Login (OTP flow)
4. На главном экране (Feed / Profile) **должен** появиться iOS system popup: «UrTruck would like to send you notifications»
5. Tap «Allow»
6. На backend проверить логи:
   ```bash
   ssh ubuntu@185.22.65.11
   sudo pm2 logs urtruck-security-api | grep -E "register-native|expo_push_token" | tail -5
   ```
   **Expected:** строка `[push] register-native received token=ExponentPushToken[...]`
7. В DB:
   ```sql
   SELECT user_id, token, provider, platform FROM push_tokens_native ORDER BY id DESC LIMIT 1;
   ```
   **Expected:** строка с `token=ExponentPushToken[...]`, `provider=expo`, `platform=ios`

**Pass criteria:** popup появился ✅, token в DB ✅, нет toast `«Не удалось получить токен»`.

---

## Test 2: Lock-screen chat notification (10 min) — P0-2 partner_name

**Цель:** push приходит на lock-screen с реальным именем отправителя (не «Заявка #123»).

**Steps:**
1. Phone A: открыть Чат с Phone B's actor (driver).
2. Phone B: lock-screen (выключить экран).
3. Phone A: отправить сообщение `«Тест push notification»`.
4. Phone B: подождать 5-10 секунд.

**Expected на lock-screen Phone B:**
```
UrTruck
[Имя Phone A actor]
Тест push notification
```
- **Title:** реальное имя partner'a (НЕ «Чат» / «Заявка #»)
- **Body:** текст сообщения (полностью)
- **Sound:** default APNS sound

**Pass criteria:** ✅ name partner'а видно, ✅ body виден, ✅ tap → app открывается на правильный chat room.

---

## Test 3: Badge counter sync (10 min) — P0-3 badge

**Цель:** unread badge на home-screen icon = number of unread events.

**Steps:**
1. Phone B: убедиться что Profile → unread count = 0 (или прочесть все notifications).
2. Phone B: home-screen — UrTruck icon **не должно быть** красного badge.
3. Phone A: отправить 3 разных сообщения с интервалом 5 sec.
4. Phone B: home-screen.

**Expected:**
- Красный badge `3` на UrTruck icon (или соответствующее число unread)
- После того как Phone B зайдёт в Чат → badge должно decrement (зависит от backend `mark_as_read`)

**Pass criteria:** badge appears + matches unread count.

---

## Test 4: Bid notification (10 min)

**Цель:** push приходит на bid event.

**Steps:**
1. Phone A: создать новый груз через `«Опубликовать»`.
2. Phone B: открыть Feed → найти груз → tap «Сделать ставку» → ввести 5000 KZT → submit.
3. Phone A: lock-screen.

**Expected на Phone A lock-screen:**
- Title: `«Новая ставка»` или имя Phone B actor
- Body: `«5000 KZT за [route]»`

**Pass criteria:** push received within 30 sec.

---

## Test 5: Cold-start tap navigation (10 min) — P0-4 message persistence

**Цель:** tap на push когда app полностью закрыт → app opens directly to relevant screen.

**Steps:**
1. Phone B: full-quit UrTruck (swipe up in app switcher).
2. Phone A: send chat message OR new bid.
3. Phone B: дождаться push на lock-screen → tap на notification.

**Expected:**
- App open'ается
- **Directly** navigates на правильный экран (Chat room / Bids list) — НЕ на Splash → Welcome → Main → Chat.
- Сообщение / bid визибен **сразу** (нет загрузки 3+ секунды).

**Pass criteria:** direct navigation + content immediately visible.

---

## Test 6: Multiple devices, same user (5 min)

**Цель:** один user logged in на 2 устройствах — push дублируется на оба.

**Steps:**
1. Phone B device #1: logged in as driver `serik`.
2. Phone B device #2 (simulator или другой iPhone): logged in as `serik`.
3. Phone A: send chat message to `serik`.

**Expected:** оба устройства получают push.

**Pass criteria:** ✅ оба device'a показывают notification.

---

## Test 7: DeviceNotRegistered cleanup (10 min)

**Цель:** когда user uninstall'ил app → следующий push должен возвращать `DeviceNotRegistered` → backend удаляет dead token.

**Steps:**
1. Phone B: write down current expo token (Profile → debug → token).
2. Phone B: uninstall UrTruck.
3. Phone A: send chat message.
4. Phone A: wait 30 sec (Expo retries).
5. Backend:
   ```sql
   SELECT * FROM push_tokens_native WHERE token = '<old_token>';
   ```

**Expected:** row deleted (token больше не в DB).

**Pass criteria:** ✅ dead token cleaned.

---

## Failure escalation

Если любой test FAIL:
1. Зайди в backend logs: `sudo pm2 logs urtruck-security-api --lines 50 | grep -i push`
2. Зайди в Expo dashboard → Notifications tab → проверь failed receipts.
3. Apple Developer console → Diagnostics → Push Notification Service Status.
4. Sentry / error tracking — check для frontend exceptions.

Если P0-1 (token register) FAIL:
- Check `app.json.expo.extra.eas.projectId` — должен быть UUID, не пустой.
- Check `expo whoami` → owner = `urtruck`.
- Try `eas push:android:upload` (для FCM) или iOS APNs key upload через Expo dashboard.

---

## Summary card (заполни после теста)

| Test | Status | Notes |
| --- | --- | --- |
| 1. Permission + token register | ☐ PASS / ☐ FAIL | |
| 2. Lock-screen chat name | ☐ PASS / ☐ FAIL | |
| 3. Badge counter sync | ☐ PASS / ☐ FAIL | |
| 4. Bid notification | ☐ PASS / ☐ FAIL | |
| 5. Cold-start tap nav | ☐ PASS / ☐ FAIL | |
| 6. Multi-device same user | ☐ PASS / ☐ FAIL | |
| 7. DeviceNotRegistered cleanup | ☐ PASS / ☐ FAIL | |

**Time required:** ~60 min total.
**Critical tests:** 1, 2, 3, 5 (P0 fixes из Build 17).
**Non-critical:** 4, 6, 7 (regression / edge cases).
