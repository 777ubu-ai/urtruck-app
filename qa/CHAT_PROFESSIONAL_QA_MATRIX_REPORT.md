# CHAT PROFESSIONAL QA MATRIX — UrTruck marketplace messaging

## 1. Ветка / коммит
`integration/build-30` (HEAD на момент прогона — после чат-фикса Variant B + отчётов).
Без EAS/TestFlight/buildNumber/прод/merge.

## 2. Окружение
- Метод: API-E2E через FastAPI `TestClient` (реальные роутеры market+chat+notifications),
  смена актёра через стаб `require_level`. Изолированная SQLite.
- Frontend target: **симулятор/устройство в этой среде недоступны** → UI/Maestro/APNS
  здесь не прогонялись (см. §9 L3).
- Push-токены: в тест-среде нет реальных APNS-токенов (send_to_user — no-op).
- APNS тестируется? **Нет** (нет реального iPhone/релиза).

## 3. Актёры
A: `ownerX` «Борис Владелец» (client) · B: `driverY` «Серик Водитель» (driver) ·
`thirdZ` (негатив).

## 4. ID прогона
CARGO1=`c714937f…`, BID_ID=`87dfc3e4…`, ROOM=`f1f4b40a…`. Лог: `qa/logs/chat-matrix/matrix_run.log`.

## 5. Матрица доставки
| # | Слой | Что проверено | Метод | Результат |
|---|---|---|---|---|
| 1 | Room identity | тот же cargo+owner+bidder → один room; другой cargo → другой | API+func | ✅ PASS |
| 2 | DB write | сообщение водителя записано под верный room_id | API | ✅ PASS |
| 3 | Recipient fetch | владелец получает сообщение водителя и наоборот | API | ✅ PASS |
| 4 | UI render (история) | одна история обеим сторонам, без дублей | API | ✅ PASS |
| 5 | Partner identity | имя «Серик Водитель», без «Собеседник», без self | API | ✅ PASS |
| 6 | Entry points | ставка/деталь/уведомление/«Чаты» → один room_id | API+код | ✅ PASS¹ |
| 7 | Unread badge | получатель +1 → 0 после чтения; своё сообщение не растит | API | ✅ PASS |
| 8 | Bell | `bid_created` приходит владельцу | API | ✅ PASS |
| 9 | Push payload | type/room_id/cargo_id/bid_id/sender_id/recipient_id | код | ✅ PASS |
| 10 | APNS device | локскрин/бейдж/тап | real device | ⛔ REAL DEVICE REQUIRED |

¹ Все точки входа резолвят один canonical room (room_id из ставки == /rooms у обеих
ролей == комната отправки). Реальный тап в UI — §7 ниже / device.

## 6. API-тесты (qa/logs/chat-matrix/matrix_run.log + backend/tests/test_deal_rooms.py)
A идемпотентность ✅ · B разные комнаты ✅ · C driver→owner (`driver-api-test-001`) ✅ ·
D owner→driver (`owner-api-test-001`) ✅ · E права 403/403 ✅ · F дубль-ставка 409 ✅ ·
G payload (поля) ✅. Юнит-тесты `test_deal_rooms` — 5/5 ✅.

## 7. App/UI без сборки
Симулятора в этой среде нет → сценарии 1-5 на устройстве/Maestro **не прогонялись здесь**.
Эквивалент доказан на API-уровне (room/sync/unread/bell/persistence). UI-скрины обеих
ролей — `qa/screenshots/chat-matrix/` (заполняется при ручном/симулятор-прогоне).

## 8. Ручной чек-лист
`qa/manual/CHAT_TWO_PHONE_CHECKLIST.md` (PASS/FAIL + плейсхолдеры скринов) и
`qa/manual/CHAT_REAL_DEVICE_CHECKLIST.md`.

## 9. Уровни push
| Уровень | Статус |
|---|---|
| **L1 — backend payload** (технические id, deep-link резолвится) | ✅ PASS |
| **L2 — in-app** (колокольчик, бейдж «Чаты» 0→1→0) | ✅ PASS |
| **L3 — реальный APNS** (локскрин/иконка/тап) | ⛔ REAL DEVICE REQUIRED |

**Приватность payload:** `data` содержит только технические id (room/cargo/bid/sender/
recipient) — **телефонов/PII нет** ✅. Видимый текст уведомления показывает превью
сообщения (стандарт мессенджера). Если хочешь скрыть превью с локскрина — отдельное
решение (P3, не баг).

## 10. Бейдж
`/chat/unread`: получатель 0→1→0 после чтения; **своё сообщение unread не растит** ✅.
Залипаний нет.

## 11. Deep-link уведомлений
Payload + url `/chats/{room_id}`; парсер `App.js navigateFromUrl` → Chat с roomId.
Тап на устройстве — L3/ручной тест.

## 12. Негативные тесты
| Кейс | Результат |
|---|---|
| send без room_id и to_user_id | ✅ 400 (не уходит «не туда») |
| третий read/send | ✅ 403/403 |
| дубль-ставка | ✅ 409, комнату не плодит |
| **битый/несуществующий room_id (read/send)** | ✅ 404, без краша |
| **груз удалён, комната есть → /rooms, /messages** | ✅ 200, без краша |
| self-fallback | ✅ убран (код ChatScreen) |
| сетевой сбой при отправке | ✅ outbox: optimistic + ретрай, без фейкового успеха (код) |
| reopen приложения → история | ✅ persistence (повторный fetch == та же история) |

## 13. Артефакты
- `qa/logs/chat-matrix/matrix_run.log`
- `qa/manual/CHAT_TWO_PHONE_CHECKLIST.md`, `qa/manual/CHAT_REAL_DEVICE_CHECKLIST.md`
- `backend/tests/test_deal_rooms.py`
- скрины: `qa/screenshots/chat-matrix/` (ручной/симулятор-прогон)

## 14. Баги по серьёзности
- **P0:** не найдено (исходный P0 «не доходят» закрыт Вариантом B).
- **P1/P2:** не найдено в этом прогоне.
- **P3 (advisory):** превью сообщения видно в тексте пуша (стандарт; скрыть — по желанию). testID на бейджах табов отсутствует (для Maestro позже).

## 15. Финальное решение
**READY FOR HUMAN DEVICE TEST.** Всё локально/API-доказуемое — зелёное. Остаётся
device-QA (L3 APNS + UI-скрины) — требует билда в TestFlight на двух телефонах.

## Прямые ответы
- Одна сделка = одна каноническая комната? **ДА**
- Сообщения синхронизируются в обе стороны? **ДА**
- Бейджи непрочитанного работают? **ДА**
- Уведомления открывают правильную комнату? **ДА** (payload+deep-link; тап на устройстве — L3)
- Payload корректен? **ДА** (технические id, без PII)
- APNS на реальном iPhone доказан? **НЕТ** (REAL DEVICE REQUIRED)
- Оправдана ли сборка сейчас? **ДА** — для device-QA (L3 + UI), т.к. чат-фикс ещё НЕ в TestFlight (билд 31 был до фикса).
