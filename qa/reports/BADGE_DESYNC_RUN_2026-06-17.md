# BADGE DESYNC — отчёт прогона 2026-06-17

- **Ветка / HEAD:** `integration/build-30` @ `e95f4ca` (+ этот коммит: conftest + 3 флоу + отчёт)
- **Окружение:** iOS Simulator (iPhone 17, Expo Go SDK 52, **New Architecture/Bridgeless**), локальный backend `127.0.0.1:8001` (Python 3.12 venv), Metro `:8081` (`EXPO_PUBLIC_API_URL=http://127.0.0.1:8001`), Maestro.
- **Android НЕ доступен** в этой среде (нет adb/SDK/эмулятора) → C2-флоу прогнаны на iOS-симуляторе (платформо-независимые testID). C1 и реальные пуши и так вне Maestro.
- Скрины (локально, gitignored): `qa/screenshots/badge-desync/`.

---

## ШАГ 3 — backend-инварианты (фундамент)

`pytest tests/test_unread_badge.py tests/test_deal_rooms.py` → **13/13 PASS**.

⚠️ Совместный прогон сначала падал «no such table: chat_rooms» — это **баг изоляции тестов**, не инвариантов: оба файла делали `os.environ.setdefault("DB_PATH", …)` на **разные** пути + `unlink` на уровне модуля, а `config.DB_PATH`/`api.chat._init()` модульного уровня (один раз). По отдельности каждый файл зелёный (8 и 5). **Фикс (с одобрения владельца):** `backend/tests/conftest.py` — единый `DB_PATH` + session-autouse fixture пересоздаёт схему после коллекции. После фикса совместный прогон = **13 PASS**.

| INV | Что | Итог |
|---|---|---|
| INV-1 | send(a→b): unread(b)+1, unread(a) без изменений | ✅ |
| INV-2 | `_compute_recipient_badge(b)` == `unread_count(b)` (C1-бэк = C2-источник) | ✅ |
| INV-3 | read открытой комнаты помечает ТОЛЬКО её, другие не трогает | ✅ |
| INV-4 | после чтения одной из двух — unread == остаток (не 0, не всё) | ✅ |
| INV-5 | своё сообщение никогда не входит в unread | ✅ |
| INV-6 | bid/system не ставит badge (badge=None) | ✅ |
| INV-7 | идемпотентность по client_msg_id (нет +2) | ✅ |
| +deal_rooms | канонические комнаты Variant B (5 тестов) | ✅ |

**Фундамент зелёный:** серверные числа C1-источника и C2-источника совпадают, read-marking покомнатный, своё не считается, bid не трогает чат.

---

## ШАГ 4 — Maestro (покрывается ТОЛЬКО C2 — точка внутри app)

| Флоу | Гипотеза | Итог | Доказательство |
|---|---|---|---|
| `unread-badge-flow` | C2 появл./гаснет | ✅ PASS | badge есть → открыл комнату → back → badge нет (`01_main_with_unread`, `04_chats_list_no_unread`) |
| `badge-no-self` (новый) | **H6** | ✅ PASS | boris 0 unread → сам шлёт сообщение → `bottom-nav-chats-badge` НЕ появился (`NS2_no_self_badge`) |
| `badge-multiroom` (новый) | **H5** | ✅ PASS | 2 непрочит. (badge=2) → прочитал одну → **`deal-room-list-unread` остался** (1 непрочит.) → прочитал вторую → **badge исчез** (`MR0/MR1/MR2/MR3`) |
| `badge-persist-restart` (новый) | C2 на рестарте | ✅ PASS | badge есть → `stopApp`+`launchApp`+reopen → **badge ещё есть** до прочтения (`PR1`, `PR3`) |

Доп. подтверждение через API в момент прогона multiroom: после прочтения ОДНОЙ из двух комнат серверный `unread_count(boris)=1` (не 0, не 2) — совпало с in-app `deal-room-list-unread`.

`chat_bid_notifications_e2e` — доказан в отдельной задаче ранее (bid→room_id, сообщения в одной комнате, partner не «Собеседник»). `audit-chat-persistence-restart`, `audit-notification-deeplink` — в батч-прогоне упёрлись в env-флак qa-login (Expo Go recents/загрузка бандла), не продукт: с прелюдией `openurl exp://…:8081` логин стабилен (подтверждено перепрогоном `unread-badge-flow`).

### Заметки по харнессу (честно)
- `bottom-nav-chats-badge` — крошечный элемент; XCUITest в New Arch **флакает индексацию** в момент re-render после прочтения. H5 «остался» надёжнее проверяется через `deal-room-list-unread` (per-room индикатор) — он и использован.
- `back` из чат-экрана на iOS Expo Go интермиттентно не срабатывает → в multiroom заменён на тап по back-стрелке (`point 7%,9%`).

---

## Матрица сценариев S1–S14

> C2 = точка внутри app (Maestro/API). C1 = бейдж на иконке — **только живое устройство**. C3 = колокольчик.

| S | Tool | Ожидалось | Фактически | Вердикт |
|---|---|---|---|---|
| S1 foreground, чат закрыт | Maestro/API (C2) | C2=1 ≤30с | C2 появляется на mount/poll (unread-badge ✅) | **C2 PASS** · C1 → REAL DEVICE |
| S2 прочтение обнуляет всё | manual (C1) | C1=C2=0 | C2=0 ✅ (back→badge нет); **C1 — REAL DEVICE REQUIRED** | C2 PASS · **C1 владелец** |
| S3 background → иконка | manual (C1) | C1→1 | — | **REAL DEVICE REQUIRED** |
| S4 killed → cold start | manual (C1) | C1→1, читал→C1=0 | C2 переживает рестарт ✅ (persist-restart); **C1 — REAL DEVICE** | C2 PASS · **C1 владелец (H1!)** |
| S5 две комнаты, читаем одну | Maestro/API (C2) | остаток корректен | ✅ badge-multiroom + INV-4 | **PASS (H5 refuted)** |
| S6 бейдж ≥10 | manual/API | C2 `9+`, C1=N | API per-room ✅; визуал `9+`/C1 — manual | частично · C1 владелец |
| S7 отправитель без счётчика | Maestro/API (C2) | у отправителя 0 | ✅ badge-no-self + INV-5 | **PASS (H6 refuted)** |
| S8 пинг-понг | manual 2 phone | гаснет/не залипает | — | REAL DEVICE (2 phone) |
| S9 активная комната без баннера | manual 2 phone | баннер подавлен | код `push.js` handler `shouldSetBadge:false` для активной | **код-подтв.** · live → владелец |
| S10 тап по push мимо списка | manual (C1) | C1=0 после | — | **REAL DEVICE REQUIRED (H1!)** |
| S11 тап по иконке без чата | manual (C1) | C1 держится | — | **REAL DEVICE REQUIRED** |
| S12 bid не трогает чат | Maestro/API | C3+1, C1/C2 без изм. | INV-6 ✅ (badge=None для bid); C3 отдельный стор | **PASS (H8 refuted на сервере)** |
| S13 медленно/офлайн | manual | нет ложного 0/зависа | `authedFetch` таймаут (фикс 85cb3c8) — код; live → manual | код-подтв. · live владелец |
| S14 web/PWA | Playwright | C2 есть, C1 нет (норма) | вне этого прогона (iOS) | не покрыто здесь |

---

## Гипотезы H1–H8

- **H1 «иконка не затухает» — НЕ опровергнута, ТРЕБУЕТ ЖИВОГО УСТРОЙСТВА.** Код-подтверждение риска: `BottomNav` пишет иконку в `useEffect([chatUnread])` (`setBadgeCountAsync(chatUnread)`) — **срабатывает только при ИЗМЕНЕНИИ `chatUnread`**. Если на момент прочтения `chatUnread` уже был 0 (cold start стартует с 0; чтение через тап по push минуя изменение стейта) → `setBadgeCountAsync(0)` не вызывается → C1 висит. **C1 нельзя проверить в Maestro/Expo Go → S2/S3/S4/S10/S11 — ручной тест владельца.**
- **H2 «есть на иконке, нет внутри»** — частично: C2-источник (`chatAPI.unread`) глотает `!r.ok`→`{unread:0}` и имеет гостевой short-circuit. На сервере C1=C2 (INV-2). Реальный рассинхрон C1↔C2 — REAL DEVICE.
- **H3 «есть внутри, нет на иконке»** — REAL DEVICE (C1).
- **H4 «лаг до 30с»** — подтверждено by design: C2 только поллинг 30с + AppState + subscribeChatRead (нет realtime). В Maestro C2 появляется на mount fetch.
- **H5 «multi-room»** — **ОПРОВЕРГНУТА** (исправно): INV-3/INV-4 + `badge-multiroom` + live API (read one → unread=1). Покомнатный декремент работает.
- **H6 «своё увеличивает счётчик»** — **ОПРОВЕРГНУТА**: INV-5 + `badge-no-self`. Отправитель не получает +1.
- **H7 «гонка badge бэк vs клиент»** — REAL DEVICE (нужны реальные APNS+клиент одновременно).
- **H8 «колокольчик путают с чатом»** — **ОПРОВЕРГНУТА на сервере**: INV-6 (bid → badge=None, не трогает chat-unread). C3 — отдельный стор.

---

## ШАГ 6 — инструментация (диагностика, НЕ закоммичена)

Для живой охоты H1 владельцу — временные `__DEV__`-логи (применить на своём устройстве, diff отдан отдельно, в коммит НЕ включён):
- `BottomNav.fetchUnread`: `console.log('[badge] server unread =', n)`
- `BottomNav` перед `setBadgeCountAsync`: `console.log('[badge] setIcon =', total)`
- `push.js` handler: `console.log('[push] recv', data.type, 'room=', data.room_id, 'activeRoom=', getActiveRoom())`

На живом устройстве в сценариях S2/S4/S10 смотреть: вызывается ли `[badge] setIcon = 0` при прочтении. Если нет — подтверждение H1.

---

## Рекомендованный фикс (раздел 11 промпта — НЕ в этом тесте, gated)

**H1 (главный, иконка не гаснет):** в `BottomNav` синхронизировать иконку **безусловно** при каждом `fetchUnread` (и на `AppState='active'`), а не только в `useEffect([chatUnread])`:
```js
// вместо useEffect([chatUnread]) → внутри fetchUnread, всегда:
Notifications.setBadgeCountAsync(server_unread).catch(()=>{});
```
Плюс на mount `ChatScreen` явный пересчёт иконки. **H7:** один писатель иконки (клиент по server unread, бэк не дублирует). Эти правки — gated (`BottomNav`/chat): по CLAUDE.md сперва анализ связей + подтверждение владельца.

---

## Итог гейта (G1–G6)

- **G2 (доставка C2)** ✅ — входящее поднимает C2 (≤ poll 30с).
- **G3 (направление)** ✅ — отправитель без счётчика (H6).
- **G4 (multi-room)** ✅ — покомнатный декремент (H5).
- **G5 (изоляция)** ✅ (сервер) — bid не трогает C1/C2 (H8/INV-6).
- **G1 (затухание C1)** ⏳ — **REAL DEVICE REQUIRED** (главный, H1): только iOS TestFlight + Android APK.
- **G6 (офлайн/устойчивость)** ⏳ — код-фикс есть (85cb3c8), live — manual.

**Вывод:** фундамент (backend) и C2 (внутри app) — зелёные; H5/H6/H8 опровергнуты. **Главный нерешённый риск — H1 (затухание иконки C1) — по природе вне Maestro/Expo Go и выполняется владельцем** по ручному чек-листу ниже.

---

## Ручной чек-лист для владельца (C1 / живые пуши — S2,S3,S4,S10,S11)

Выполняется на **двух реальных устройствах** (A=владелец, B=водитель), iOS TestFlight и Android APK отдельно. По каждому — шаблон §9 промпта (C1/C2/C3, лаг, скрин иконки).

1. **S2 (затухание, главный):** B→A сообщение → A видит C1=1 на иконке → A открывает чат, читает, выходит, сворачивает → **смотрит иконку: C1 должно стать 0**. Зафиксировать, гаснет ли.
2. **S3 (background):** app A свёрнут → B шлёт → C1→1 + баннер → A разворачивает (не открывая чат) → C2=1 → открыл чат → вышел → свернул → C1=0.
3. **S4 (killed → cold start):** app A убит свайпом → B шлёт → C1→1 → A открывает с иконки → C2 в ≤30с → читает → выходит → **C1=0?** (H1-подозрение).
4. **S10 (тап по push):** A background, 0 непрочит. → B шлёт → A **тапает баннер** → комната открыта → вышел → **C1=0, C2=0?** (H1).
5. **S11 (тап по иконке без чата):** непрочит.=1, app killed → A открыл с иконки, остался на Feed (не в чат), свернул → C1 держится (норма) → затем зашёл в чат, прочитал → C1=0.

С включёнными `__DEV__`-логами (ШАГ 6) в логе устройства смотреть `[badge] setIcon = …` в момент прочтения.
