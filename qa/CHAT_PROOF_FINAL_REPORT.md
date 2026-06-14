# CHAT PROOF — FINAL REPORT (proof only, no build)

> Это отчёт-доказательство. **Не про сборку.** Вердикт ниже.

## Вердикт
**PROOF COMPLETE — READY FOR HUMAN TWO-PHONE TEST.**
Всё, что доказуемо **без устройства** (backend/API/код/негатив/регресс) — зелёное.
То, что физически нельзя проверить без телефона (UI-рендер бейджа, APNS на локскрине,
скриншоты) — честно помечено как требующее устройства; это и есть предмет
двух-телефонного теста.

## 1. Окружение
- API-E2E через FastAPI `TestClient` (реальные роутеры market+chat+notifications),
  смена актёра через стаб `require_level`, изолированная SQLite.
- **Симулятора/устройства в этой среде нет** → UI-скриншоты и APNS здесь не снимались.
- Лог: `qa/logs/chat-proof/proof_run.log` (14/14 PASS).

## 2. Актёры
A `ownerX` «Борис Владелец» (client) · B `driverY` «Серик Водитель» (driver) · `thirdZ`.
ID прогона: bid_id `3fb338e2…`, room_id `b35fbfa6…`.

## 3. Полная цепочка чата (API/логи)
| Шаг | Проверка | Результат |
|---|---|---|
| A1 | ставка → bid_id + room_id | ✅ PASS |
| A2 | владелец получает bid-уведомление (`bid_created`) | ✅ PASS |
| B1 | room_id водителя == владельца == из ставки | ✅ PASS |
| B2 | другой груз → другая комната | ✅ PASS |
| B3 | дубль-ставка → 409, новой комнаты нет | ✅ PASS |
| B4 | третий: read/send → 403/403 | ✅ PASS |
| C1 | owner видит `driver-proof-message-001` | ✅ PASS |
| C2 | driver видит `owner-proof-reply-001` | ✅ PASS |
| C3 | reopen: оба сообщения, без дублей, не исчезают | ✅ PASS |
| D1 | партнёр — реальное имя, без «Собеседник», не self | ✅ PASS |

## 4. Уведомления и бейджи — 3 уровня
**Level 1 — backend payload: ✅ PASS.** `api/chat.py` шлёт `data = {type:"chat_message",
room_id, cargo_id, bid_id, sender_id, recipient_id}`, url `/chats/{room_id}`. Без PII.
Bell `bid_created` создаётся владельцу (проверено через `/notifications`).

**Level 2 — in-app bell/badge:**
- Данные: ✅ PASS — `/chat/unread` 0→1→0 после прочтения; **своё сообщение unread не растит**.
- Проводка UI (code-verified): `src/components/ui/v1/BottomNav.js` опрашивает
  `chatAPI.unread()` (poll 30с) + мгновенный re-fetch по событию `subscribeChatRead`,
  рисует красный бейдж `testID="bottom-nav-chats-badge"` при `chatUnread>0`, синхронит
  app-icon badge через `Notifications.setBadgeCountAsync`. Колокольчик —
  `useUnreadNotifications` → `notificationsAPI.unread()`.
- **Пиксельный UI-рендер: NOT TESTED (нет симулятора).** → **L2 UI proof missing —
  cannot approve build on this alone; проверяется на устройстве.**

**Level 3 — реальный APNS: NOT TESTED / REAL DEVICE REQUIRED.** Локскрин-пуш,
инкремент иконки, тап-в-чат — только реальный iPhone/TestFlight.

## 5. Скриншоты
**НЕТ. API proof only, UI screenshot proof missing.** Причина: **в этой среде нет
симулятора/UI-окружения** (cloud-контейнер, нет macOS/iOS-симулятора, переключение
актёров в UI невозможно). Каталог `qa/screenshots/chat-proof/` пуст — заполняется при
ручном прогоне на устройствах по чек-листу.

## 6. Двух-телефонный чек-лист
`qa/manual/CHAT_TWO_PHONE_CHECKLIST.md` (16 шагов, PASS/FAIL, плейсхолдеры скринов).

## 7. Негативные кейсы (лог)
| Кейс | Результат |
|---|---|
| send без room_id и to_user_id | ✅ 400 |
| битый/несуществующий room_id (read+send) | ✅ 404, без краша |
| удалённый груз → /rooms, /messages | ✅ 200, без краша |
| своё сообщение не растит unread | ✅ PASS |
| третий read/send | ✅ 403/403 |
| дубль-ставка | ✅ 409, без новой комнаты |
| фронт self-fallback | ✅ убран (код ChatScreen) |
| сетевой сбой при отправке | ✅ outbox: optimistic+ретрай, без фейк-успеха (код) |

## 8. Ветка / scope
| Фича | Ветка | PR/коммит | Включено сейчас? |
|---|---|---|---|
| chat Variant B | integration/build-30 | `318789a` | ✅ ДА |
| QA matrix/proof docs | integration/build-30 | — | ✅ ДА |
| splash/иконки | integration/build-30 | `c97b10b…6ed1873` | ✅ ДА |
| CGR real queue (за флагом) | integration/build-30 | `79cfe92` | ✅ ДА |
| driver-flow cleanup | fix/driver-flow-critical-ux-cleanup | — | ❌ НЕТ (другая линия) |
| PR #104 verification foundation | fix/driver-verification-onboarding | #104 (open) | ❌ НЕТ |
| PR #105 verification upload | fix/verification-upload-flow | #105 (open, dirty) | ❌ НЕТ |

## 9. Прямые ответы
1. Owner и driver делят один room_id? — **ДА**
2. Сообщения синхронизируются в обе стороны? — **ДА**
3. Сообщения сохраняются после reopen? — **ДА**
4. Уведомления открывают правильную комнату? — **ДА** (payload+url+парсер; тап на устройстве — L3)
5. Колокольчик работает в UI? — **ДА на уровне данных/проводки; пиксельный UI-рендер NOT TESTED (нет симулятора)**
6. Нижний бейдж «Чаты» работает в UI? — **ДА на уровне данных/проводки (testID есть); пиксельный UI-рендер NOT TESTED**
7. Backend push payload корректен? — **ДА**
8. APNS доказан на реальном iPhone? — **НЕТ (REAL DEVICE REQUIRED)**
9. UI-скриншоты есть? — **НЕТ (нет симулятора в этой среде)**
10. Готовы к human two-phone test? — **ДА** (по чек-листу; нужен билд на двух телефонах)
11. Готовы к сборке? — **не утверждаю.** Всё не-TestFlight-доказуемое зелёное, но L2-UI/
    L3-APNS/скриншоты не закрыты без устройства. Решение о сборке — за владельцем.

## Соблюдено
❌ EAS · ❌ TestFlight · ❌ buildNumber · ❌ app.json/package release · ❌ прод · ❌ merge.

---

# Expo Go UI proof (добавлено 14.06, 09:50)

## ⚠️ Главное, честно
**UI-скриншоты в этой среде получить НЕЛЬЗЯ.** Облачный контейнер: нет симулятора
iOS/Android, нет реального телефона, нет Expo Go, нет рендера экрана. Я **не могу**
сам снять `qa/screenshots/chat-proof-ui/*.png` и прогнать два телефона. Фейковые
«визуальные» доказательства не делаю. UI-визуал — это часть, которую выполняет
**человек** по пакету `qa/manual/CHAT_TWO_PHONE_*` (Путь A, Expo Go).

## 1. Тестируется правильный код
- path `/home/user/urtruck-app`, branch `integration/build-30`, commit `2cf80f6`, дерево чистое.
- Variant B чат-фикс `318789a` — в истории ✅.
- Миграция применяется на свежем backend DB: `chat_rooms` содержит `deal_key/owner_id/bidder_id/bid_id` ✅.
- EXPO_PUBLIC_API_URL / phones-Wi-Fi / Expo-ветка: **задаются при ручном запуске** (см.
  `CHAT_TWO_PHONE_LAUNCH_STEPS.md`); здесь телефоны не запускались.

## 2-4. Бейдж / колокольчик / deep-link — визуально НЕ сняты
- Данные и проводка кода доказаны (L1+L2-data, BottomNav testID `bottom-nav-chats-badge`,
  `/chat/unread` 0→1→0). **Пиксельный UI-рендер и тап — NOT CAPTURED здесь.**
- → **UI badge/bell/tap proof missing in this env — закрывается человеком в Путь A.**

## 5. Жёсткие состояния (API) — все PASS
| Кейс | Результат |
|---|---|
| S9 длинное сообщение (2400 симв.) целиком | ✅ PASS |
| S10 эмодзи/юникод (🚚🔥👍 中文 ©) | ✅ PASS |
| S4 ретрай (тот же client_msg_id) → 1 сообщение (дедуп) | ✅ PASS |
| S4 два разных быстрых → 2 сообщения | ✅ PASS |
| S7 битый room_id → 404 без краша | ✅ PASS |
| S8 удалён груз → /messages не падает | ✅ PASS |
| S1 owner вне чата → unread>0 | ✅ PASS |
| S2 owner внутри чата → сообщение сразу видно | ✅ PASS |

## 6. Source of truth (для ясности, НЕ запрос на сборку)
| Фича | Ветка | Commit/PR | В текущем Expo-тесте (build-30)? | Для будущего билда? |
|---|---|---|---|---|
| driver-flow cleanup | fix/driver-flow-critical-ux-cleanup | — | НЕТ | решение владельца |
| Variant B chat room | integration/build-30 | `318789a` | ДА | да |
| chat proof docs | integration/build-30 | — | ДА (доки) | n/a |
| PR #104 verification foundation | fix/driver-verification-onboarding | #104 (open) | НЕТ | решение владельца |
| PR #105 upload flow | fix/verification-upload-flow | #105 (open,dirty) | НЕТ | решение владельца |
| CGR real queue (флаг) | integration/build-30 | `79cfe92` | ДА | да |
| splash/иконки | integration/build-30 | `c97b10b…6ed1873` | ДА | да |
| P1/P2 фиксы | integration/build-30 | `8ceb42e`/`26d24ef` | ДА | да |

## Вердикт (Expo Go UI proof)
**READY FOR HUMAN EXPO TEST.** Код/API/жёсткие состояния — зелёные; фиксов не требуется.
UI-визуал (бейдж/колокольчик/тап/скриншоты обеих ролей) **обязан снять человек** в
Путь A (Expo Go + локальный backend) — в этой среде это технически невозможно.
APNS lock-screen / иконка-бейдж / тап с локскрина — остаются REAL DEVICE (Путь B, билд).
**НЕ пишу READY FOR BUILD.**

## Прямые ответы (UI-визуал)
1. Визуально доказал, что owner видит сообщение водителя в UI? — **НЕТ** (нет симулятора/устройства здесь; делает человек)
2. Визуально доказал, что driver видит ответ в UI? — **НЕТ** (та же причина)
3. Визуально доказал нижний бейдж «Чаты»? — **НЕТ** (данные+проводка ✅, пиксель — человек)
4. Визуально доказал колокольчик? — **НЕТ** (данные ✅, пиксель — человек)
5. Визуально доказал тап уведомления → нужный чат? — **НЕТ** (payload+парсер ✅, тап — человек)
6. APNS lock-screen? — **НЕТ** (REAL DEVICE / TestFlight)
7. Достаточно ли для сборки? — **не утверждаю**; решение о сборке — за владельцем после human-теста.
