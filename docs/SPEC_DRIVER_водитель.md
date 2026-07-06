# UrTruck — Спецификация роли «Водитель» (driver)

> Документ для команды разработки. Полная логика стороны перевозчика: регистрация/верификация,
> навигация, поиск грузов, ставки, очередь на границе, сделка, трекинг. Источник — код
> (`src/`, `backend/api/marketplace.py`, `backend/api/registration.py`). Версия: 2026-07.
> Парный документ: `SPEC_CLIENT_грузоотправитель.md`.

---

## 0. Роль «driver»

**Водитель/перевозчик** в FTL-маркетплейсе UrTruck (коридор Китай ↔ СНГ). Логика:
ищет грузы в ленте → делает **ставки** → выигрывает → везёт.
Акцент — **`#00E676`** (изумрудный неон); текст на изумрудных кнопках — чёрный `#0C0A09`.

---

## 1. Таб-бар водителя (КАНОН — 5 вкладок, менять нельзя)

1. **Грузы** (`Feed` = `FeedScreen`) — лента доступных грузов (стартовый экран).
2. **Мои рейсы / Работа** (`MyWork` = `MyTripsScreen`) — мои ставки, сделки, архив.
3. **Очередь** (`Queue` = `QueueScreen`) — электронная очередь на КПП/границе (центральная вкладка).
4. **Чаты** (`Chats` = `ChatsListScreen`) — переписка по ставкам/сделкам, бейдж непрочитанного.
   **Отдельная вкладка — не прятать в профиль.**
5. **Профиль** (`Profile`) — внутри: Кошелёк, Безопасность/скоринг, Уведомления, Настройки,
   Онлайн-регистрация, Пригласить друга.

---

## 2. Регистрация и верификация (многошаговая, «образец-вперёд»)

Маршрут экранов: **Identity → Selfie → VehicleDocs → VehiclePhotos → TruckParams**
(`src/screens/registration/*`).

- На каждом фото-шаге **сначала показывается образец** (✅ как надо / ❌ как нельзя, тап = крупно) —
  компонент `PhotoGuide`. Шаги фото: личное фото, селфи, права (лицевая), селфи с правами,
  техпаспорт, авто снаружи/салон.
- **ИИН** — валидация 12 цифр (`IdentityStepScreen`) + бэкенд-проверка (422 на невалид).
- **Тип кузова:** `tent` · `ref` · `platform` · `auto` · `izoterm` + свободное «другое».
- **OCR** документов (Tesseract), **биометрия/face-match**, **скоринг 0–100** (6 компонентов +
  бонус, веса в `config.SCORING_WEIGHTS`), чёрный список.
- `verification_level` 0→3; часть действий гейтится `VerificationGate`.
- Вход: SMS (Mobizon, реально), Email-OTP (готово, ждёт SMTP), WhatsApp/Telegram (mock), BETA-код.

---

## 3. Основной цикл: ставка → сделка

```
[Лента грузов] → открыть карточку (CargoDetail)
      │
      ▼
[Сделать ставку] BidModal (сумма + сообщение, валюта груза) → bid = pending
      │   клиент: принять / контр-оффер / отклонить / чат
      ▼
[Ставка accepted] → создаётся СДЕЛКА (deal)
      │
      ▼
[Deal room] чат + статусы: погрузка · граница · выгрузка → delivered → взаимные отзывы
```

---

## 4. Экраны и кнопки

### 4.1 Грузы — `FeedScreen`
`marketAPI.listCargos({fromCity, toCity, cargoType, limit, offset})` → `GET /cargos`.
Фильтры: **Направление · Дата · Кузов · Цена**. Тап по карточке → `CargoDetail`.

### 4.2 Карточка груза — `CargoDetail`
Детали груза; кнопка **«Сделать ставку»** → модалка `BidModal` (сумма + сообщение, валюта груза)
→ `marketAPI.createBid()` → `POST /bids` → ставка `pending`.

### 4.3 Мои рейсы / ставки — `MyTripsScreen`
Данные: `marketAPI.myDashboard()` → `{ my_bids, my_deals, my_trips, ... }`.
Кнопки по своей ставке (у всех стабильные `testID`):
| Кнопка | Действие | API |
|---|---|---|
| **Редактировать** (`bid-edit`) | изменить сумму/сообщение | `PATCH /bids/{id}` |
| **Скидка** (`bid-discount`) | снизить свою цену | `PATCH /bids/{id}` |
| **Принять контр** (`bid-accept-counter`) | согласиться на встречную цену клиента | `POST /bids/{id}/counter/accept` |
| **Отклонить контр** (`bid-decline-counter`) | отказаться от встречной | `POST /bids/{id}/counter/decline` |
| **Чат** (`bid-chat`) | комната переговоров | `openBidChat` |
| **Отменить** (`bid-cancel`) | снять свою ставку | `POST /bids/{id}/cancel` |

Модалка `BidModal` — currency-aware (валюта груза, быстрые цены в этой валюте).

### 4.4 Очередь на границе — `QueueScreen`
Электронная очередь на КПП: встать в очередь, видеть позицию/статус (`/api/v1/borders`).

### 4.5 Сделка — `DealRoom` / `ChatScreen`
- `getDeal(dealId)` → стороны, сумма «Ставка: … <валюта>», статус.
- Чат клиент↔водитель (авто-перевод, `/api/v1/chat`).
- **Водитель шлёт локацию:** `sendDealLocation(dealId, coords)` → `POST /deals/{id}/location`.
- Статусы перевозки: `updateDealStatus(dealId, newStatus)` → погрузка → граница → выгрузка → `delivered`.

### 4.6 Профиль — `ProfileScreen`
Скоринг/бейдж безопасности, Кошелёк (`WalletScreen`), документы/верификация, язык (RU/KK/ZH/EN),
Настройки, Выход, Удалить аккаунт.

---

## 5. Статусы
- **Ставка (bid):** `pending` → `countered` → `accepted` / `rejected` / `cancelled`.
- **Сделка (deal):** `in_progress` → погрузка/граница/выгрузка → `delivered`.

---

## 6. Ключевые API (BASE `/api/v1/market`, + регистрация `/api/v1/register`)
`POST /bids` (сделать ставку) · `PATCH /bids/{id}` · `POST /bids/{id}/cancel` ·
`POST /bids/{id}/counter/accept` · `POST /bids/{id}/counter/decline` · `openBidChat` ·
`GET /cargos` (лента) · `GET .../dashboard` (`my_bids`, `my_deals`) · `GET /deals/{id}` ·
`POST /deals/{id}/status` · `POST /deals/{id}/location` ·
регистрация: `/register/*` (OTP, документы, селфи, ИИН, техпаспорт, фото авто).
Авторизация: `Authorization: Bearer <token>` (`ur_reg_token` из storage).

---

## 7. Бизнес-правила и краевые случаи
1. Нельзя дважды поставить на один груз → `409`; `amount = 0` → `400`.
2. Когда клиент принимает одну ставку — остальные по этому грузу авто-`rejected` (транзакционно).
3. Суммы — только через `formatPrice(amount, currency)` (валюта груза, фолбэк USD). Не хардкодить `$`.
4. Гость (без сессии) видит ленту/карточки, но ставка требует входа (deferred auth) + верификации.
5. Терминология: у клиента входящие = «предложения», у водителя это его «ставки»; цена = «Ставка».
6. Не возвращать demo/seed-данные в прод-UI; canon таб-бара (5 вкладок, Чат отдельно) соблюдать.
7. Все тексты — через `t(...)`, 4 языка (RU/KK/ZH/EN).

---

## 8. Стек
- **Backend:** Python 3.12 + FastAPI + SQLite (+ Redis, APScheduler). Модули: `api/marketplace.py`,
  `api/registration.py`, `scoring/`, `ocr/`, `verification/`, `blacklist/`.
- **Frontend:** React Native + Expo SDK 52 (JS). Экраны: `FeedScreen`, `MyTripsScreen`, `CargoDetail`,
  `QueueScreen`, `DealRoom`, `ProfileScreen`, регистрация — `src/screens/registration/*`.
  Данные: `src/utils/marketAPI.js`, `AuthContext`, `store.js`, `i18n`.
- **Прод:** сервер `185.22.65.11`, `urtruck.kz` (nginx: `/` → фронт, `/security/*` → бэк :8001).

---

*Парный документ: `SPEC_CLIENT_грузоотправитель.md` (сторона грузоотправителя).*
