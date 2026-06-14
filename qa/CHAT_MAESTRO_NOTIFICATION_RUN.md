# CHAT MAESTRO NOTIFICATION RUN — Variant B канонические комнаты

- **Дата/время:** 2026-06-14 22:04 (+05)
- **Ветка:** `integration/build-30`
- **Commit (база):** `55bb06e` + QA-правки этого прогона (testID + флоу + отчёт), коммит ниже
- **Backend URL (приложение):** `https://transmission-les-decorative-jeff.trycloudflare.com` (cloudflare-туннель → локальный uvicorn `:8001`, Python 3.12 venv)
- **Backend для ensure-actor (Maestro):** `http://127.0.0.1:8001/api/v1` — **та же** инстанция/БД, что и через cloudflare
- **Expo mode:** локальный Metro `:8081` (Node 20), `EXPO_PUBLIC_API_URL=https://transmission-les-decorative-jeff.trycloudflare.com`. iOS Simulator (iPhone 17, Expo Go SDK 52, New Arch). *Для прогона на симуляторе Metro переведён из `--tunnel` в локальный режим; cloudflare-туннель бэка оставался активным.*
- **Флоу:**
  - `qa/maestro/chat_bid_notifications_e2e.yaml` (owner = boris)
  - `qa/maestro/chat_driver_view.yaml` (driver = serik)

## Метод (честно про одно устройство)
Два телефона одновременно один симулятор не даёт → проверка **последовательная**: сначала owner-сессия (boris), затем driver-сессия (serik) на одном симуляторе через QA-логин (`_lib/qa-login.yaml` + `ensure-actor`). Кросс-актёрное состояние и числовые инварианты доказаны **через API** (раздел 12), а in-app рендер значков/чата/сообщений — через Maestro UI на каждой стороне. Никаких фейков: все скрины сняты Maestro, все API-ответы реальные.

## Команды
```bash
# backend (Python 3.12 venv) уже поднят на :8001, открыт через cloudflare
# API-доказательство (раздел 12):
bash /tmp/chat_evidence.sh
# засев детерминированных данных для UI:
python3.12 /tmp/seed_maestro.py   # cargo + serik bid + serik msg "QA driver msg MAESTRO"
# owner in-app:
MAESTRO_QA_AGENT_TOKEN=*** MAESTRO_BACKEND_BASE=http://127.0.0.1:8001/api/v1 \
  MAESTRO_ACTOR=boris maestro test qa/maestro/chat_bid_notifications_e2e.yaml
# driver in-app:
MAESTRO_ACTOR=serik maestro test qa/maestro/chat_driver_view.yaml
```

## Результат прогонов
| Флоу | Итог |
|---|---|
| `chat_bid_notifications_e2e` (owner) | ✅ **PASSED** (все шаги COMPLETED) |
| `chat_driver_view` (driver) | ✅ **PASSED** (все шаги COMPLETED) |

Скриншоты (сняты Maestro, `qa/maestro/screenshots/`):
- `CH1_chats_list_with_unread.png` — список «Сделки»; **красный бейдж «1» на вкладке «Чаты»** (`bottom-nav-chats-badge`) + оранжевый unread на комнате (`deal-room-list-unread`).
- `CH2_chat_open_driver_msg.png` — owner видит партнёра **«Serik (driver agent)»** (не «Собеседник») и сообщение **«QA driver msg MAESTRO»**.
- `CH3_owner_reply_sent.png` — owner отправил **«QA owner reply MAESTRO»** из UI.
- `CD2_driver_sees_owner_reply.png` — driver видит партнёра **«Boris (shipper agent)»** (не «Собеседник»), свою реплику ✓✓ и ответ owner **«QA owner reply MAESTRO»** (история сохранена).

## API / лог-доказательство (раздел 12)
Прогон `chat_evidence.sh` (owner=agent-boris, driver=agent-serik):
- **bid response содержит room_id:** `{"id":"593d2a6c…","ok":true,"room_id":"84a2f6ae-6036-4df2-88a1-8113030f84f4"}` ✅
- **notification payload (bid):** `type:"bid_created"`, `title:"💰 Новое предложение $2400"`, `body:"Serik (driver agent) предлагает $2400 за Алматы→Москва"`, `url:"/cargos/<cargo_id>?bid=<bid_id>"` → содержит **cargo_id + bid_id + sender(Serik)**, `user_id:"agent-boris"` = recipient ✅
- **сообщения в одном room_id:** driver «QA driver message…» (agent-serik) + owner «QA owner reply…» (agent-boris) — обе в `84a2f6ae…` ✅
- **нет дублей комнат:** ровно **1** комната для cargo (cargo+owner+bidder) ✅
- **partner_name:** «Serik (driver agent)» — **не «Собеседник»** ✅
- **unread:** дельты корректны — **+1** при сообщении водителя, **−1** при прочтении owner; driver unread **0→1** при ответе owner. *База ≠ 0 (переиспользуемая тестовая БД с прошлыми комнатами), но per-room и дельты верны.*

UI-прогон (детерминированный засев, room `933debc9-0d7a-4e62-8383-412aeb648edb`):
- owner отправил «QA owner reply MAESTRO» **из приложения** → API подтвердил, что реплика легла в **ту же** комнату `933debc9…`, driver unread = 1, комнат с этим id = **1**, partner «Serik (driver agent)». ✅

## Что НЕ доказано в этом прогоне (честно)
- **Колокол (bell) уведомлений в UI:** payload `bid_created` доказан по API; в Maestro проверен **бейдж вкладки «Чаты»** (`bottom-nav-chats-badge`), а отдельный in-app бейдж **колокола** на ленте в этом флоу не ассертился (фид уведомлений/колокол питается из `store.js` и требует отдельной синхронизации). Добавлен testID `bell-unread-badge` для будущего ассерта.
- **Чистый абсолютный 0→1→0** глобального unread — база была ≠ 0 из-за переиспользуемой QA-БД; доказаны корректные **дельты** и per-room состояние.
- **APNS lock-screen push:** **NOT PROVEN in this run; requires real build/TestFlight.** Maestro/Expo Go это доказать не могут.

## Изменения кода (минимальные, безопасные — только testID)
- `src/screens/ChatScreen.js`: `testID="chat-partner-name"` на имя партнёра (анти-«Собеседник»). `chat-input` / `chat-send-btn` уже были.
- `src/components/ui/v1/BellBadge.js`: `testID="bell-unread-badge"` на красный счётчик колокола.
- Существующие и использованные testID: `bottom-nav-chats`, `bottom-nav-chats-badge`, `chats-header`, `deal-room-list`, `deal-room-list-card`, `deal-room-list-unread`, `cargo-card`, `chat-input`, `chat-send-btn`.

## ФИНАЛЬНЫЙ ВЕРДИКТ

### ✅ 1. MAESTRO IN-APP FLOW PASSED
- ставка создана (+ **room_id в ответе**) ✅
- каноническая комната создана (Variant B: cargo+owner+bidder, **без дублей**) ✅
- сообщение водителя видно owner **в приложении** (`CH2`) ✅
- ответ owner виден driver **в приложении** (`CD2`) ✅
- поведение **бейджа вкладки «Чаты» / unread** проверено внутри приложения (`CH1`) ✅
- история сохранена (обе реплики в одной комнате, обе стороны) ✅
- **нет «Собеседник»** — партнёры резолвятся корректно (owner↔«Serik», driver↔«Boris») ✅

Не доказано в этом прогоне и вынесено отдельно: in-app бейдж **колокола** уведомлений (только API-payload), чистый абсолютный 0→1→0 глобального unread.

**APNS lock-screen push remains pending for real build/TestFlight device QA.**
