# PR 2 — Серверные доработки + UX-полировка «Сделок» (план для облачного сеанса)

**Ветка:** создать новую от `main` (напр. `claude/pr2-server-ux`).
**База выверена по коду `origin/main`** (все ссылки `файл:строка` — на момент составления; перед правкой перепроверить grep'ом, номера могли сместиться).
**Правило:** продуктовую логику менять аккуратно; где помечено ⚠️ — сначала воспроизвести, потом чинить. Тесты — на изолированном локальном стенде (не прод).

---

## Приоритет и порядок
Сначала «дешёвые и готовые» (4, 5), затем серверные (1, 2), затем требующие расследования (3), в конце вычистка (6).

---

## 1. `PATCH /market/trips/{id}/unpublish` + кнопка «Снять с публикации»

**Backend** (`backend/api/marketplace.py`):
- Добавить эндпоинт по образцу `update_trip_status` (там же рядом):
  ```python
  @mp_router.patch("/trips/{trip_id}/unpublish")
  def unpublish_trip(trip_id: str, user=Depends(require_level(1))):
      # 404 если нет; 403 если trip.driver_id != user["id"];
      # 409 если есть активная сделка по рейсу (нельзя снять забронированный);
      # UPDATE trips SET status='unpublished' WHERE id=?
  ```
- ✅ **Готово даром:** `list_trips` фильтрует `status = 'active'` (`where = ["status = ?"]`, default `status="active"`) → `unpublished` **автоматически** исчезает из публичной ленты. Отдельный фильтр не нужен.
- ⚠️ Проверить: владелец видит свой `unpublished` рейс в `/market/my` (там свой фильтр) — чтобы можно было вернуть/удалить.

**Frontend** (`src/screens/TripDetail.js`):
- Сейчас импорт `removeTrip` (`:15`), вызов локального store вместо API.
- ⚠️ Кнопку «Снять с публикации» по тексту **не нашёл** — возможно её нет вовсе (не «раскомментировать», а **добавить**). Найти место рендера действий владельца рейса (рядом с «Изменить»/«Удалить») и добавить кнопку → `marketAPI.unpublishTrip(id)` (добавить метод в `src/utils/marketAPI.js`), убрать `removeTrip`.
- Кнопка — outline по эталону #137 (не заливная), одна primary на экран уже есть.

**Acceptance:** driver снимает рейс → `status=unpublished` → рейс пропал из ленты клиента (`GET /market/trips`), но виден владельцу в «Мои рейсы».

---

## 2. Убрать eager chat room (чат только с момента accept)

**Backend** (`backend/api/marketplace.py`):
- Чат-комната создаётся **до accept** в ТРЁХ местах через `_ensure_chat_room_inline` (`:1629`):
  - `create_bid` — строки **1193** и **1214** (cargo-ветка и trip-ветка).
  - `counter_bid` — внутри (тоже вызывает `_ensure_chat_room_inline`).
- Убрать эти вызовы из `create_bid` и `counter_bid`. Оставить создание комнаты в `_finalize_accept_inline` (accept).
- ⚠️ **Подводные камни:**
  - `open_chat_for_bid` (`POST /bids/{id}/chat`) явно открывает чат на `pending`/`countered` ставке. Раз «до accept — без переписки» — закрыть/ограничить его (возвращать 409 до accept) или удалить, иначе дыра остаётся.
  - Deeplink `bid_created`/`counter` на main = `/cargos|trips/{id}` (не `/chats`), поэтому удаление комнаты deeplink не ломает. Проверить, что нигде не читается `created_room_id` как обязательный.
  - `/chat/rooms` и бейдж не должны показывать «пустые» комнаты pending-ставок (их больше не будет — ок).

**Acceptance:** после подачи ставки (без accept) — `GET /chat/rooms` у обеих сторон НЕ содержит комнату по этой ставке; после accept — комната есть.

---

## 3. ⚠️ Push routing для counter-offer — СНАЧАЛА ВОСПРОИЗВЕСТИ

**Посылка задачи под вопросом.** По коду `counter_bid` (`marketplace.py`) **уже** делает всё правильно:
- `send_to_user(bid["bidder_id"], ...)` + `create_notification(bid["bidder_id"], "bid_countered", ...)` → пуш идёт **водителю** (биддеру).
- Внутри `counter_bid` **нет** auto-reject siblings и **нет** «Ставка не выбрана».
- «Ставка не выбрана» (`_notify_rejected_siblings`) шлётся только в `_finalize_accept_inline` при **accept** (проигравшим).

**Значит:** либо баг не в counter, либо симптом «уходит не тому» вызван другим (напр. клиент counter'ит, а UI ошибочно триггерит accept/reject; или несколько ставок и путаница получателя).
**Задача сеанса:** воспроизвести на стенде (клиент делает встречное → проверить, кто получил какой `notifications`-тип из БД). Только после подтверждённого репро — чинить. **Не менять `counter_bid` вслепую.**

---

## 4. Server-side unread count для бейджа «Сделки»

- ✅ **Уже есть** `GET /chat/unread` (`backend/api/chat.py:632`, `unread_count`, возвращает `{"unread": N}`).
- Задача просила `/chat/unread-count`. Варианты: (а) переиспользовать `/chat/unread`; (б) добавить алиас `/chat/unread-count`.
- ⚠️ **Важно:** бейдж на вкладке «Сделки» = `chatUnread + notifUnread` (по канону BottomNav). `/chat/unread` считает **только чат**. Нужен либо комбинированный эндпоинт (chat + непрочитанные deal-уведомления), либо клиент складывает `/chat/unread` + `/notifications/unread`. Определиться и заменить клиентский подсчёт на серверный.

**Acceptance:** бейдж «Сделки» берётся с сервера, совпадает с `chatUnread + notifUnread`; не пересчитывается на клиенте руками.

---

## 5. Флаги стран на маршрутах

- ✅ **Хелперы есть:** `src/utils/geography.js:25` (`KZ: {flag:'🇰🇿', name}`), `cities.js`, `countries.js` — маппинг ISO→flag. **Не писать новый словарь.**
- `FeedCard` (`src/components/ui/v1/FeedCard.js`) уже получает `route.fromCountry`/`route.toCountry`.
- Рендерить `geography[iso]?.flag` рядом с городом (from/to) в: `FeedCard`, карточках «Сделок» (`ChatsListScreen` renderDealCard/renderOfferCard), hero `CargoDetail`/`TripDetail`.
- Набор: 🇰🇿🇨🇳🇷🇺🇺🇿🇰🇬🇹🇯 — все есть в geography.js (проверить наличие TJ/KG/UZ).
- ⚠️ Fallback: если `from_country` пуст — не рисовать флаг (не ломать layout).

**Acceptance:** в карточках грузов/рейсов/сделок рядом с городами стоят флаги по from/to country; пустой country → без флага.

---

## 6. Полная вычистка `picked_up`

Остатки (PR1 убрал только из фильтров навигации):
- `src/utils/i18n.js` — **8 вхождений** (все 4 языка, удалить ключи `*picked_up*` / `trip_cargo_accepted` если больше не используются — проверить usage перед удалением).
- `src/utils/store.js:19` — `TRIP_STATES = ['planned','picked_up','in_transit','delivered']` → убрать `'picked_up'`.
- `src/utils/store.js:23` — `picked_up: {icon,labelKey,color}` в `TRIP_STATE_INFO`.
- `src/components/deal/DealRoom.js:27` — `picked_up: '#FF8400'` в маппинге цветов.
- ⚠️ **Подводный камень:** `TRIP_STATES` — это машина состояний, `picked_up` может использоваться в `advanceTripState` и переходах. Убирать из массива = **логика, не косметика**. Проверить весь usage `picked_up` и `advanceTripState` (grep) — убедиться, что переход `planned → in_transit` не разрывается. Если сервер где-то шлёт `picked_up` — согласовать (иначе UI не отрисует статус).

**Acceptance:** `grep -rn picked_up src/` пусто; статус-лестница рейса не сломана (accepted→in_progress→at_border→delivered), тесты статусов зелёные.

---

## Итоговый чек-лист PR 2
- [ ] 5. Флаги стран (готовые хелперы) — карточки грузов/рейсов/сделок
- [ ] 4. Server-side unread (уже есть /chat/unread; сделать комбинированный для бейджа Сделок)
- [ ] 1. `PATCH /trips/{id}/unpublish` + кнопка в TripDetail (list_trips уже фильтрует active)
- [ ] 2. Убрать eager chat из create_bid (1193,1214) + counter_bid; пересмотреть open_chat_for_bid
- [ ] 3. ⚠️ Counter-push: воспроизвести → диагностировать → чинить (counter уже шлёт bidder_id)
- [ ] 6. Вычистка picked_up (i18n×8, store.js:19/23, DealRoom.js:27) — с проверкой TRIP_STATES-логики
- [ ] Прогон на изолированном стенде (см. паттерн из client-report прошлого сеанса), НЕ прод
