# CHAT E2E PREBUILD REPORT — готовность чата к живому тесту на телефонах

## 1. Ветка / коммит
`integration/build-30` (на момент прогона HEAD = чат-фикс Variant B `318789a` +
отчёты). Без EAS/TestFlight/buildNumber/прод/merge.

## 2. Локальный / API-прувы
Сквозной E2E через реальные роутеры (`market`+`chat`+`notifications`, FastAPI
TestClient, смена актёра через стаб `require_level`). Полный лог:
`qa/logs/chat-e2e-prebuild/e2e_run.log`. Все 12 проверок — **PASS**.

## 3. Room ID
- Ставка возвращает `room_id`. Пример: `4710c43f-…`, bid_id `3dc3d9f5-…`.
- У водителя и грузовладельца в `/chat/rooms` — **один и тот же** room_id == room_id из ставки. **PASS**
- Партнёр: owner видит «Серик Водитель», driver — «Борис Владелец», **без «Собеседник»**. **PASS**

## 4. Sync driver → owner
`driver-live-test-001` отправлено водителем → грузовладелец видит в той же комнате. **PASS**

## 5. Sync owner → driver
`owner-live-reply-001` отправлено владельцем → водитель видит. История одинаковая, без дублей. **PASS**

## 6. Bell-уведомление
`/notifications` владельца содержит `bid_created` «Новое предложение $…». **PASS**

## 7. Нижний бейдж «Чаты» (in-app)
`/chat/unread`: 0 → 1 (новое сообщение) → 0 (после открытия чата). **PASS**

## 8. Push payload
`api/chat.py` формирует `data` = `{type:"chat_message", room_id, cargo_id, bid_id,
sender_id, recipient_id}`, url `/chats/{room_id}`. Deep-link парсится в `App.js`
(`navigateFromUrl` → Chat с roomId). **PASS (payload-уровень)**.

## 9. APNS на реальном устройстве
**REAL DEVICE REQUIRED** — лок-скрин/фон/иконка-бейдж в этой среде не тестируются
(нет реального телефона/релиза). См. уровни ниже.

---

## Уровни доказательства push
| Уровень | Что | Статус |
|---|---|---|
| **L1 — backend payload** | notification-запись создаётся; payload c room_id/cargo_id/bid_id/sender_id/recipient_id; deep-link резолвится в нужную комнату | ✅ PASS |
| **L2 — in-app** | колокольчик появляется; бейдж «Чаты» растёт/гаснет; тап открывает нужный чат | ✅ PASS (unread/bell проверены API; навигация — deep-link парсер) |
| **L3 — реальный APNS** | пуш на лок-скрин/home, инкремент иконки, тап открывает чат | ⛔ **REAL DEVICE REQUIRED** (не тестировалось) |

## Негативные
третий read/send → 403/403; send без room_id и to_user_id → 400; дубль-ставка → 409.
Все **PASS**.

## Гейты
test_deal_rooms 5/5 ✅ · qa:i18n ✅ · qa:ux ✅ · babel (Chat/chatAPI/TripDetail) ✅ · регрессий нет.

## testID для будущего Maestro
Кнопка отправки: `chat-send-btn` ✅ (есть). Бейджи табов/колокольчика — testID
пока нет (живут в gated-навигации; для ручного теста на телефонах не нужны).

## Артефакты
- Лог: `qa/logs/chat-e2e-prebuild/e2e_run.log`
- Ручной чек-лист: `qa/manual/CHAT_REAL_DEVICE_CHECKLIST.md`
- Скриншоты обеих ролей: каталог `qa/screenshots/chat-e2e-prebuild/` (заполняется
  при ручном прогоне на устройствах — здесь симулятора нет).

## Найденные баги
- В этом прогоне по чату — **не найдено** (P0 ранее закрыт Вариантом B).

## Финальное решение
**READY FOR HUMAN DEVICE TEST.** Всё локально/API-доказуемое — зелёное. Для живого
теста нужен билд в TestFlight на двух телефонах (или симулятор-Maestro для L2-скринов).

## Прямой ответ
**Могут ли владелец и сотрудник протестировать на двух телефонах по чек-листу?**
**ДА** — как только на оба телефона встанет билд с этим чат-фиксом (сейчас фикс на
ветке `integration/build-30`, но **в TestFlight его ещё нет** — последний залитый
билд 31 был ДО чат-фикса). Нужно: собрать новый билд (32) с веткой build-30 и
поставить на оба телефона. Чек-лист готов: `qa/manual/CHAT_REAL_DEVICE_CHECKLIST.md`.
