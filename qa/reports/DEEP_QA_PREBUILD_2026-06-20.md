# DEEP QA PRE-BUILD — глубокая приёмка перед билдом, 2026-06-20

- **Ветка / HEAD:** `integration/build-30` @ `1f5036e`.
- **Среда:** backend `:8001` MOCK · iPhone 17 (iOS 26.4) sim · Expo Go 2.32.18 · Metro `:8081` · прод-бандл `dist/` через прокси `:8090`. Актёры `/qa/ensure-actor`: serik=driver, boris=client.
- **Правило:** баги НЕ чинились (только фиксация). REAL-DEVICE / STATE-SEED помечены явно.
- **Скриншоты:** `qa/screenshots/deep-reg/` (gitignored).

## Главный вывод
**P1/P2 баги НЕ найдены.** Найдено **3× P3** (латентные нестыковки/мёртвый код, пользователю не видны). Прод-бандл собирается и ведёт себя как dev (0 console-ошибок на критпути). Валютный фикс и testID кнопок ставок подтверждены на нативе И на прод-бандле.

---

## Слой 0 — статические гейты

| # | Проверка | Вердикт | Детали |
|---|---|---|---|
| 0.1 | `npm run build:web` | ✅ PASS | `Exported: dist`, без ошибок |
| 0.2 | `npx tsc --noEmit` | ✅ PASS | exit 0, 0 ошибок типов |
| 0.3 | i18n полнота (скрипт `qa/utils/i18nAudit.js`) | ✅ PASS | 4 языка (RU/KK/ZH/EN) × **1575 ключей симметрично**; **0 сырых ключей** (каждый `t('...')` есть в RU); 0 непереведённых относительно RU |
| 0.4a | хардкод валюты у сумм (вне formatPrice) | ✅ PASS | совпадения benign (ChatsList/DealRoom — currency-aware, Notifications — комментарий) |
| 0.4b | web-only API (document/window/localStorage) | ✅ PASS | все 25+ вызовов под guard `Platform.OS==='web'`/`typeof window` (проверены offlineQueue, ShimmerButton, OfflineBanner, ProfileScreen, DriverDetail, DesignPreview, ErrorBoundary) |
| 0.5 | seed/demo/mock в прод-UI | 🟡 1× P3 | DesignPreview — dev-gated (`qaDesignMode`); Reg/Auth mock — это OTP-MOCK-режим (условный); **TrackScreen — мёртвый демо-экран (P3-1)** |
| 0.6 | канон навигации | ✅ PASS | driver tab-bar = Feed/MyWork/Queue/Chats/Profile (5, Chats отдельно, без Publish); client — отдельный layout |

## Слой 1 — backend API (MOCK)

| Поток | Вердикт | Детали |
|---|---|---|
| `/system/info` | ✅ | otp/sms/telegram=MOCK, face=heuristic, storage=local |
| market: создание в 5 валютах | 🟡 P3 | KZT/RUB/CNY/USD → ок; **UZS → коэрсится в USD** (whitelist `marketplace.py:360`) — P3-2 |
| market: currency на ставках | ✅ | `incoming_bids`/`my_bids`/`list_bids`/`my_deals` несут currency (4 pilot-валюты) |
| bid lifecycle | ✅ | counter 200, accept-counter 200, 2-я ставка на занятый → **409**, amount=0 → **400** |
| registration validation | ✅ | `/register/selfie` невалид → **422** |
| chat | ✅ | room по ставке создаётся, send 200, `/chat/messages/{room}` 200, rooms 200, translate требует `message_id` (422 на raw text — корректно) |
| reviews/notifications/borders/leaderboard | ✅ | `/reviews/for|summary/{id}` 200, notifications 200, borders 200, leaderboard 200 |

## Слой 2 — Maestro LIVE, обе роли

| Пункт | Вердикт | Источник |
|---|---|---|
| A1 регистрация 6 шагов (образец-вперёд, QaStepSkip) | ✅ LIVE PASS | прошлая сессия (код не менялся) |
| A3 канон 5 вкладок (Feed/MyWork/Queue/Chats/Profile) | ✅ LIVE PASS | `driver-canon-tabs` |
| A4 Feed+фильтры | ✅ LIVE PASS | скрин `A3-01-feed` (₸450 000, фильтры) |
| A5 ставка edit/discount/counter/cancel/chat по testID | ✅ LIVE PASS | `driver-bid-actions` (этой сессией FAILED=0); статусы меняются (API) |
| A7 Queue | ✅ LIVE PASS | `driver-queue-cgr` |
| B3 Предложения accept/reject/counter/chat + валюта | ✅ LIVE PASS | `client-offers-actions`; тосты на скринах + статусы (API) |
| **B4 сделка → deal room** (STATE-SEED: in_progress) | ✅ **LIVE PASS (новое)** | `client-deal-room`: Chats→фильтр сделок→`deal-room-card` «Ставка: 580000 KZT» (`B4-02`) |
| B5 табы клиента / B6 logout | ✅ LIVE PASS | прошлая сессия |
| A2 профиль/Security, B2 детали груза, B1 createcargo полностью | 🟡 PARTIAL | форма B1 рендерится (поля ок, падал hideKeyboard — харнесс); A2/B2 — переходы открываются, но глубокая клик-проверка ограничена индексацией текста New Arch (кнопки без testID на этих экранах) |

## Слой 3 — матрица краёв/валидаций

| Проверка | Вердикт | Источник |
|---|---|---|
| ИИН: пустой/короткий/нечисловой/валидный | ✅ | клиент `IdentityStepScreen.js:78-83` (digits/12) + backend 422 (Слой 1) |
| Типы кузова tent/ref/platform/auto/izoterm + «другое» | ✅ (частично live) | backend принял tent/ref (Слой 1); список типов в коде; ×6 в UI — не кликал каждый |
| Валюты: символ/шкала по валюте груза | ✅ | formatPrice (5 символов) + BidModal currency-aware (B-CUR закрыт); прод-бандл ₸ (Слой 4) |
| Гостевой режим (hasToken && !session) | ✅ LIVE | прод-бандл: онбординг/лента грузов, 0 ошибок, 0 raw-ключей (`L3-01`) |
| Смена языка (raw-ключи/краш) | ✅ (статика) | 0.3 доказал симметрию 1575 ключей → raw-ключей нет; live-переключатель на ленте авторизованного (у гостя — онбординг) |
| Пустые состояния | ✅ | EmptyState-компоненты в коде (offers/searching/enroute/delivered/chats) |

## Слой 4 — ПРОД-БАНДЛ (то, что деплоится)

| Проверка | Вердикт | Детали |
|---|---|---|
| dist через прокси :8090, критпуть boris | ✅ **PASS** | Предложения: валюта **₸** (нет `$420000`), bid-testID присутствуют (accept/reject/counter/chat ×8), **accept → тост «Предложение принято»**, **0 console-ошибок** (`L4-01/02`) |
| dev vs prod расхождения | ✅ нет | поведение прод-бандла = dev |

---

## ЕДИНЫЙ СПИСОК БАГОВ

| ID | Серьёзность | Баг | Файл:строка | Репро | Видно пользователю? |
|---|---|---|---|---|---|
| P3-1 | **P3** | `TrackScreen` — мёртвый legacy-экран с хардкод-демо маршрутом «Москва→Иу→Алматы» и `startTracking('demo')` | `src/screens/TrackScreen.js:46-56`; зарегистрирован `AppNavigator.js:308` как `Track`, но **нет ни одной `navigate('Track')` из UI** | недостижим из UI | НЕТ (мёртвый код) |
| P3-2 | **P3** | Валюта **UZS** коэрсится в **USD** при создании груза/рейса (backend-whitelist `USD/KZT/RUB/CNY`) | `backend/api/marketplace.py:360` (и `:575`) | API: создать груз `currency:"UZS"` → вернётся `USD` | НЕТ (UI создания предлагает только 4 pilot-валюты; UZS убран — `CreateCargoScreen.js:37-38`) |
| P3-3 | **P3** | Фрагментация списков валют: `currency.js` `CURRENCIES`=6 (USD/KZT/RUB/CNY/UZS/KGS), `normalizers.CURRENCY_SYMBOLS`=5 (нет KGS), backend whitelist=4 (нет UZS/KGS) | `src/utils/currency.js:115` vs `src/utils/normalizers.js:47` vs `backend/api/marketplace.py:360` | — | НЕТ сейчас (риск, если новый UI начнёт брать список из `currency.js`) |

**Доп. (информационно, не баг):** CLAUDE.md упоминает «11 языков», фактически в `i18n.js` — 4 (RU/KK/ZH/EN), все полные. Док устарел. `formatBids` ссылается на несуществующий код языка `'KG'` (мёртвая ветка, безвредно).

## Рекомендация к фиксу пачкой (один PR, по желанию владельца)
1. **P3-2 + P3-3 (валюты):** унифицировать список валют в один источник. Либо вернуть UZS/KGS в backend-whitelist + UI, либо убрать их из `currency.js`/`normalizers`. Сейчас безопасно (UI = 4 валюты), но это «мина» на будущее. Backend `marketplace.py:360,575`.
2. **P3-1 (TrackScreen):** удалить мёртвый `Track`/`TrackScreen` (и `Wallet`, если тоже мёртв) или убрать хардкод-демо. Чистка перед билдом.
3. Обновить CLAUDE.md (4 языка, не 11); убрать ветку `'KG'` в `formatBids`.

**Вывод: блокеров для билда нет.** Все P3 — латентные, пользователю не видны. Критпуть (создать груз→ставка→принять→чат), валюта, сделка/deal room, табы, гость, i18n — зелёные на dev И на прод-бандле.

## REAL DEVICE REQUIRED (не проверялось)
Бейдж на иконке телефона, фоновые APNS/FCM-пуши.

## Новые артефакты
`qa/utils/i18nAudit.js` (i18n-чекер), `qa/maestro/client-deal-room.yaml` (B4 deal room). Скриншоты — `qa/screenshots/deep-reg/` (L3-*, L4-*, B4-*, A3-*, A5-*, B3-*).
