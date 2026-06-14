# Runbook: тест чата на двух телефонах (Путь A — Expo Go + локальный backend)

Простая инструкция. Без сборки, без TestFlight. Проверяет: ставку, уведомление,
чат водитель↔грузовладелец в обе стороны, красную точку «Чаты» в приложении.

---

## A. Подготовка Mac

1. Открой **обычный терминал** (не Claude).
2. Перейди в проект и возьми правильную ветку:
   ```
   cd ~/Downloads/urtruck-app
   git fetch origin
   git checkout integration/build-30
   git reset --hard origin/integration/build-30
   ```
3. Проверь, что всё чисто и это нужный коммит:
   ```
   git status
   git log --oneline -1
   ```
   Должно быть: «nothing to commit» и сверху свежий коммит build-30.
4. Узнай локальный IP мака (запиши его):
   ```
   ipconfig getifaddr en0
   ```
   Пример: `192.168.1.50`
5. Запусти **backend** (новая вкладка терминала):
   ```
   cd ~/Downloads/urtruck-app/backend
   python3 -m uvicorn main:app --host 0.0.0.0 --port 8001
   ```
   (если ругается на зависимости — один раз: `pip install -r requirements.txt`)
6. Запусти **Expo** (первая вкладка), подставив СВОЙ IP из шага 4:
   ```
   cd ~/Downloads/urtruck-app
   nvm use 20
   EXPO_PUBLIC_API_URL=http://192.168.1.50:8001 npx expo start
   ```
7. В терминале появится **QR-код** — оставь окно открытым.

## B. Подготовка телефонов
1. **Телефон A** = грузовладелец, **Телефон B** = водитель.
2. Оба телефона — в **той же Wi-Fi**, что и Mac (без «изоляции клиентов» на роутере).
3. Установи/открой **Expo Go** (из App Store) на обоих.
4. В Expo Go: **Scan QR Code** → отсканируй QR из терминала.
5. Если iOS спросит «разрешить доступ к локальной сети» — **Разрешить**.
6. Дождись загрузки приложения (первый раз дольше).
7. Войди в аккаунты: Телефон A — **грузовладелец**, Телефон B — **водитель** (РАЗНЫЕ аккаунты).
   - Если вход по SMS-коду и он не приходит (MOCK-режим) — код виден в логе backend (вкладка uvicorn).

## C. Ход теста
1. B (водитель): открыть груз.
2. B: «Предложить цену» → ввести → отправить.
3. A (владелец): проверить колокольчик 🔔 «Новое предложение $…».
4. B: открыть «Чат по заказу».
5. B: отправить `driver-live-test-001`.
6. A: проверить красную точку на «Чаты» / колокольчик → открыть чат.
7. A: увидеть `driver-live-test-001`.
8. A: ответить `owner-live-test-001`.
9. B: увидеть ответ.
10. Оба: выйти из чата и снова зайти.
11. Оба сообщения на месте, без дублей.
12. Красная точка «Чаты» пропала после прочтения.

Подробный чек-лист с галочками: `qa/manual/CHAT_TWO_PHONE_CHECKLIST.md`.

## D. Скриншоты (складывать в `qa/screenshots/chat-proof-ui/`)
- `phoneA_owner_bid_notification.png`
- `phoneA_owner_bid_visible.png`
- `phoneB_driver_chat_sent.png`
- `phoneA_owner_chat_received.png`
- `phoneA_owner_chat_replied.png`
- `phoneB_driver_chat_received_reply.png`
- `phoneA_owner_chats_badge.png`
- `phoneB_driver_chats_badge.png`

## E. Правила PASS/FAIL

**P0 FAIL (критично — сразу сообщи):**
- у сторон РАЗНЫЙ чат/комната;
- владелец НЕ видит сообщение водителя;
- водитель НЕ видит ответ владельца;
- сообщения исчезают;
- неверный партнёр / «Собеседник»;
- бейдж/уведомление о входящем НЕ появляется вообще;
- уведомление открывает НЕ тот экран.

**НЕ тестируется в Пути A (это только TestFlight/Путь B):**
- пуш на заблокированный экран (APNS);
- бейдж на иконке приложения;
- тап по нативному пушу в TestFlight;
- доставка в фоне.

---

## Mac Terminal — copy (только команды)
```
cd ~/Downloads/urtruck-app
git fetch origin
git checkout integration/build-30
git reset --hard origin/integration/build-30
git status
git log --oneline -1
ipconfig getifaddr en0
```
Вкладка 2 (backend):
```
cd ~/Downloads/urtruck-app/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001
```
Вкладка 1 (Expo, подставь свой IP вместо 192.168.1.50):
```
cd ~/Downloads/urtruck-app
nvm use 20
EXPO_PUBLIC_API_URL=http://192.168.1.50:8001 npx expo start
```
Дальше — Expo Go на обоих телефонах → Scan QR → вход в два аккаунта → раздел C.
