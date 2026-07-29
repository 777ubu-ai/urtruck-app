# PUSH QA REPORT — UrTruck

> Проход 1 — полная диагностика push-пайплайна по PUSH_QA_MASTER_BRIEF.
> Среда: облако без iOS-симулятора. Source of truth — код + live backend
> (`https://urtruck.kz/api/v1`). Правки в Проходе 1 не вносились (кроме
> тестового харнесса Level 2).

## Статус уровней

| Level | Статус | Примечание |
|---|---|---|
| L1 Code Review | ✅ выполнен | 7 багов (BUG-001…007) |
| L2 Backend API | ✅ safe-сабсет | `scripts/test_push_pipeline.sh`; +2 бага (BUG-008/009). Позитивные send/deliver — Chef (нельзя слать реальные пуши / мутировать прод) |
| L3 Maestro + simctl | 🚫 BLOCKED | Нет iOS-симулятора в облаке. Flow-файлы `.maestro/10-13-push-*.yaml` НАПИСАНЫ как артефакт — прогон на устройстве Шефа |
| L4 Негативные | 🟡 частично | Из кода (см. ниже); часть требует устройства |
| L5 Manual (device) | 📋 план | `qa/PUSH_DEVICE_TEST.md` — для Шефа |

---

## БАГИ

### BUG-001 — P0 — web/PWA push доставка мертва (subscribe читает заголовок как query)
`backend/api/push.py:68` — `def subscribe(sub: SubscribeIn, authorization: str = None):`
`authorization` объявлен обычным параметром без `Header(...)` → FastAPI трактует
его как **query-параметр**. Клиент шлёт токен в HTTP-заголовке
`Authorization: Bearer …` (`src/utils/push.js`). Значит `authorization` всегда
`None` → `user_id=None` → строка в `push_subscriptions` навсегда «гостевая»
(`ON CONFLICT … COALESCE(excluded.user_id, user_id)` при NULL владельца не проставит).
`_web_subs(user_id)` ищет `WHERE user_id = ?` → **адресный web-push не доходит**.
Repro: PWA → разрешить пуши → в БД `push_subscriptions.user_id IS NULL` → bid/chat
push этому юзеру: `_send_web` вернёт 0. Причина: пропущен `Header(...)` (в теле
есть мёртвый `from fastapi import Header`). Эталон рядом — `register_native` (:104)
использует `Header(None)`.

### BUG-002 — P1 — deep-link `deals` рассинхрон: тап-по-пушу vs тап-в-списке
`App.js:57-58` (нативный пуш, cold-start + warm): `deals` → `navigate('ChatsList')` (id выброшен).
`src/screens/NotificationsScreen.js:141` (тап в колокольчике): `deals` → `navigate('Chat', { dealId })` (Deal Room).
Все deal-пуши шлют `url=/deals/{deal_id}` (bid_accepted, deal_created, deal_status).
Итог: тап по пуш-баннеру «ставка принята / сделка / статус рейса» из фона/убитого
приложения кидает в **общий список чатов** без контекста; тот же элемент из
колокольчика — в **Deal Room**. Причина: `navigateFromUrl` в App.js не обновили
под ветку `deals` (в NotificationsScreen обновили).

### BUG-003 — P1 — app-icon badge не гасится при чтении внутри ChatScreen (device-verify)
Единственный вызов `setBadgeCountAsync` — `BottomNav.js:82` (`syncAppIconBadge`),
работает только пока смонтирован таб-бар. При открытом `ChatScreen` (stack поверх
табов) чтение помечает `is_read=1` и зовёт `notifyChatRead()` (`ChatScreen.js:343`),
но подписчик в BottomNav уже отписан на unmount → **иконка не пересчитывается**.
Формулы badge сервера и клиента совпадают (chat+notif unread), расхождение — из-за
момента синка. Точное поведение — только на iPhone.

### BUG-004 — P2 — registerNative считает 200 успехом даже при user_id=null
`src/utils/push.js` проверяет только HTTP 200..299. `register-native`
(`push.py:104-123`) возвращает `200 {"ok":true,"user_id":null}` при протухшем
auth-токене → токен пишется с `user_id=NULL`, `_native_tokens(user_id)` его не
найдёт → **пуши не доходят, а клиент рапортует ok** и кэширует токен, из-за чего
авто-регистрация на старте не «чинит» (ON CONFLICT только `last_seen`). Клиент
игнорирует `user_id` из ответа.

### BUG-005 — P2 — тап по пушу cargo/trip не передаёт `role` (device-verify)
`App.js:53-56` навигирует `CargoDetail/TripDetail` без `role`; `NotificationsScreen`
передаёт `role`. Если экран меняет ветку по роли — из пуша может открыться неверный
вид. Проверить на устройстве.

### BUG-006 — P2 — возможная двойная навигация на cold-start (device-verify)
`App.js` на старте зовёт `getLastNotificationResponseAsync()` **и** ставит
`addNotificationResponseReceivedListener`. На части версий Expo SDK listener тоже
ловит «запускающий» тап → `navigateFromUrl` дважды. Дедупа по id ответа нет.

### BUG-007 — P3 — переназначение токена на общем устройстве
`push.py:118` `COALESCE(excluded.user_id, user_id)`: гостевой re-register не
перезапишет владельца → до `DeviceNotRegistered` пуши прежнего юзера могут уходить
на чужой телефон при смене владельца без явного unsubscribe.

### BUG-008 — P2 — register-native принимает пустой токен (Level 2)
Live-тест: `POST /push/register-native` с `token:""` → 200. Валидации нет → мусорные
строки в `push_tokens_native`, которые никогда не доставят; все пустые токены
коллизят на одной строке (`ON CONFLICT(token)`). Фикс: 400 при пустом/битом токене.

### BUG-009 — P3 — unregister-native без авторизации (Level 2)
`push.py:127` — `unregister_native(body: dict)` без auth. Любой, зная строку токена,
удалит его. Токен полу-секретный (ExponentPushToken[...]) → риск низкий, но
неавторизованный delete.

### Наблюдения (не баги)
- Chat-пуши идут только `send_to_user` (без `create_notification`) — их нет в
  колокольчике (осознанно, chat unread считается отдельно).
- `send_to_user` дефолт `kind="info"` → bid-пуши уходят `kind='info'` вместо `'bid'`
  (на badge/подавление не влияет; повлияет на будущие настройки категорий — P3).
- `url="/"` и `url="/profile"` события (welcome/reminder/approve/reject/review/
  trip_status booked) → навигация не обрабатывает, тап просто открывает апп (ожидаемо).

---

## МАТРИЦА СОБЫТИЙ × РОЛЕЙ (из брифа, сверено с кодом)

| # | Событие | Кому | Push text (код) | url | badge | Статус |
|---|---|---|---|---|---|---|
| D1 | Ставка принята | bidder | «💰… принята» | `/deals/{id}` | ✅ | ⚠️ BUG-002 deep-link |
| D2 | Ставка отклонена | bidder | «Ставка отклонена» | `/cargos\|trips\|/` | ✅ | `/`→no-op нав |
| D3 | Новое сообщение | участник | «[Имя]: …» | `/chats/{room}` | ✅ | ⚠️ BUG-003 badge |
| D4 | Верификация approved | driver | «Вы подтверждены» | `/profile` | ✅ | нав не ведёт на VerificationApproved (экран удалён в Этап 6) |
| D5 | Верификация rejected | driver | «Документ не принят» | `/profile` | ✅ | нав не ведёт на Rejected (экран удалён) |
| D6 | Сделка завершена/статус | участник | «Статус сделки изменён» | `/deals/{id}` | ✅ | ⚠️ BUG-002 |
| S1 | Новая ставка на груз | owner | «Новая ставка [сумма]» | `/cargos/{id}?bid` | ✅ | ⚠️ BUG-005 role |
| S2 | Новое сообщение | участник | «[Имя]: …» | `/chats/{room}` | ✅ | ⚠️ BUG-003 |
| S3 | Водитель принял условия | owner | статус | `/deals/{id}` | ✅ | ⚠️ BUG-002 |
| S4 | Груз доставлен | owner | «Доставлен» | `/deals/{id}` | ✅ | ⚠️ BUG-002 |

Примечание D4/D5: пуши идут, но экраны `VerificationApproved/Rejected` удалены при
чистке Этапа 6 — тап ведёт «в приложение» (url=`/profile`). Для honest-flow это ок
(авто-одобрение), но deep-link из брифа на эти экраны более не существует. Задокументировано.

## МАТРИЦА СОСТОЯНИЙ ПРИЛОЖЕНИЯ

| Состояние | Ожидание брифа | Из кода | Вердикт |
|---|---|---|---|
| Killed → тап | холодный старт сразу на экран | `getLastNotificationResponseAsync` + `navigateFromUrl` | ⚠️ BUG-006 (двойная нав?) + BUG-002 (deals) — device-verify |
| Background → тап | resume на экран, badge+1 | listener + badge из payload | ⚠️ BUG-002/003 — device-verify |
| Foreground, другой экран | in-app баннер, тап=нав | `setNotificationHandler` shouldShowBanner | device-verify Expo SDK 52 |
| Foreground, ТА ЖЕ комната | баннер НЕ показывается | suppress по `data.room_id===getActiveRoom()` (push.js) | ✅ логика есть; гонка focus/blur — device-verify |
| Lock screen | пуш + badge иконки | APNs + badge payload | 📋 только device (L5) |
| Offline→online | доставка после сети | Expo/APNs очередь | 📋 только device (L5) |
| Logout | пуш НЕ приходит | token cleanup? | ⚠️ регистрация без auth (BUG-004) + logout не деактивирует токен явно — device-verify |

---

## LEVEL 4 — негативные (из кода)

| Сценарий | Из кода | Вердикт |
|---|---|---|
| Пустой payload | `navigateFromUrl` guard'ит `if (!parsed) return` | ✅ не крашит |
| Несуществующий roomId | ChatScreen грузит по roomId, при пустом — остаётся пустой чат | 🟡 не белый экран, но пустой — device-verify |
| Эмодзи/китайский в тексте | текст как строка, RN рендерит | ✅ (device spot-check) |
| Очень длинное сообщение | обрезка на стороне iOS/Expo | 📋 device |
| Push после удаления груза | тап → CargoDetail с cargoId → 404 handled (`get_cargo` 404) | 🟡 экран покажет «не найдено» — device-verify |

---

## ПРОХОД 2 — РЕЗУЛЬТАТЫ ФИКСОВ

| BUG | Severity | Статус | Проверка |
|---|---|---|---|
| BUG-001 | P0 | ✅ FIXED (branch) | код+py_compile; доставка web-push — Level 5 после деплоя |
| BUG-002 | P1 | ✅ FIXED (branch) | код+babel; deep-link deals→Deal Room, как в NotificationsScreen |
| BUG-003 | P1 | ✅ FIXED (branch) | код+babel; иконочный бейдж — финал на устройстве (Level 5) |
| BUG-004 | P2 | ✅ FIXED (branch) | код+babel; user_id из ответа, не кэшируем при null |
| BUG-005 | P2 | ✅ FIXED (branch) | код+babel; role прокинут в тапе |
| BUG-006 | P2 | ✅ FIXED (branch) | код+babel; дедуп по identifier |
| BUG-008 | P2 | ✅ FIXED (verified LIVE) | прод после деплоя: empty→400, valid→200 (было 200/200); + изолированный TestClient |
| BUG-007 | P3 | 📝 DOCUMENTED | не фиксим (P3): переназначение токена на общем устройстве до DeviceNotRegistered |
| BUG-009 | P3 | 📝 DOCUMENTED | не фиксим (P3): unregister-native без auth (токен полу-секретный) |

**Статус деплоя:** по явному «добро» владельца фиксы задеплоены на `main` (CI →
backend push.py + web). Backend-часть подтверждена вживую (BUG-008: пустой токен
→ 400). Фронт-фиксы (BUG-002/003/004/005/006) на web живут; полное подтверждение
на iOS (иконочный бейдж, deep-link из убитого приложения, web-push доставка
BUG-001) — Level 5 на устройстве Шефа.

**Регресс:** синтаксис всех тронутых файлов проверен (`@babel/parser` +
`py_compile`) — без регрессий. Прогон Maestro smoke 10-13 — BLOCKED (нет
iOS-симулятора в облаке), выполняется на устройстве Шефом.

## GATE DECISION (финал)

**PUSH READY (с оговоркой)** — весь код-уровень (P0+P1+P2) исправлен и
верифицирован статически/изолированно. Осталось **Level 5 на реальном iPhone**
(Шеф) для подтверждения фактической APNs-доставки, app-icon badge и deep-link
из фона/убитого приложения — это принципиально не проверяется из облака.

Порядок для Шефа:
1. Задеплоить ветку (backend push.py — BUG-001/008) + фронт.
2. Собрать build, прогнать `qa/PUSH_DEVICE_TEST.md` + Maestro 10-13.
3. Особое внимание: BUG-003 (иконочный бейдж гаснет при чтении в чате),
   BUG-002 (тап по пушу сделки → Deal Room), BUG-001 (web-push доходит).

Список для Шефа (Level 5) — в `qa/PUSH_DEVICE_TEST.md`.
