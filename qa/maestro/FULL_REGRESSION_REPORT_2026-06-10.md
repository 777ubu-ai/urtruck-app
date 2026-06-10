# UrTruck — Full Maestro regression report (2026-06-10, post PR #100)

## Environment

| | |
| --- | --- |
| Branch | `claude/youthful-cerf-barf3` (integration) |
| Integration HEAD | `f56c4c8` (Merge PR #100 — P1 fixes from Maestro marketplace audit) |
| Predecessor | `25d5d5f` (Merge PR #99 — safe QA auth path) |
| Backend | local `URTRUCK_ENV=development`, uvicorn on `http://127.0.0.1:8001`, SQLite at `backend/database/security.db` |
| Frontend | Expo Metro, `EXPO_PUBLIC_API_URL=http://127.0.0.1:8001` via `.env` |
| Maestro | 2.6.0, appId `host.exp.Exponent` |
| Simulator | iPhone 17 / iOS 26.4 / Expo Go SDK 52 (Bridgeless + New Architecture) |
| Actors | serik (driver, level=3), boris (client, level=3), auditor (level=3) |
| QA token | `MAESTRO_QA_AGENT_TOKEN` exported (not committed, generated ad-hoc) |

## Flows run

| Flow | Steps | Result |
| --- | --- | --- |
| `driver-auth.yaml` | 33 | ✅ PASS |
| `client-auth.yaml` | 33 | ✅ PASS |
| `verification-deep.yaml` | 25 | ✅ PASS (D1 fix proof: PRO CTA → EditProfile, не Identity) |
| `verification-authenticated.yaml` | 23 | ✅ PASS |
| `marketplace-driver-chat.yaml` | 23 | ✅ PASS |
| `createcargo-authenticated.yaml` | 26 | ✅ PASS |
| `unread-badge-flow.yaml` (new) | 18 | ✅ PASS (D5 unread badge + D2 chat-room enriched) |
| `push-filter-flow.yaml` (new) | 12 | ✅ PASS |
| `lang-switch-flow.yaml` (new) | партиально | ⚠️ Maestro+RN New Arch не индексирует язык-карты по тексту; lang switching проверен i18n smoke (0 missing × 4 lang) |

**Backend curl loops:** 4-state D12 matrix (anon=0 / auditor=0 / bidder=0 / owner=1) ✅, 13-step marketplace loop (publish → bid → accept → message → unread → read → reply → unread → read) ✅.

Total UI screenshots: **29** в `qa/maestro/screenshots/full-regression-2026-06-10/`.

## Driver result (full)

| Tab | Status | Notes |
| --- | --- | --- |
| Грузы (Feed) | ✅ | Empty state «Пока нет активных грузов» (or 1 QA cargo if backend has visible). Фильтры Направление / Дата / Кузов / Цена. Search «Найти груз или маршрут…». Нет дубликатов «Маршрут уточняется», когда есть данные (наш QA cargo `Шымкент → Бишкек` рендерится правильно). |
| Рейсы (MyWork) | ✅ | Big green «+ Опубликовать маршрут», статус-фильтры, stats (Активных/Откликов/В работе). CreateTrip открывается, форма рендерится pre-fill из truck params. |
| Очередь (Queue) | ✅ | `queue-title` + `queue-cgr-link-approved` для approved actor. 4 border posts с real-time данными (машин / часов / status badge). «Подробнее про CarGoRuqSat». 24–48h копия присутствует. |
| Чаты (Сделки) | ✅ | `deal-room-list`, `chats-header`, filters Все/Непрочитанные/Активные/Архив. Card rich context: partner name + cargo desc + route + bid + status + last message + unread badge. |
| Профиль | ✅ | `profile-my-status` (driver-only), `profile-pro-cta`, `profile-push-filter`. assertNotVisible «Обновить приложение». **D1 fix verified**: PRO CTA → EditProfile (not Identity). |

## Client result (full)

| Tab | Status | Notes |
| --- | --- | --- |
| Грузы (My cargos) | ✅ | «Мои грузы» header, фильтры Активные/В работе/Архив. Empty state с «Разместить груз» CTA. После публикации (PHASE 4) cargo появляется в списке со статусом `taken`. |
| Машины (trips feed) | ✅ | «Рейсы» header (P2 D4 — несовпадение Tab/Header — известно). Search same placeholder как driver (P2 D5). |
| Разместить (Publish) | ✅ | CreateCargo полная форма: from/to/desc/truck/date/weight/volume/payment/photo. `cargo-submit-button` после scroll. Validation работает. |
| Профиль | ✅ | Нет `profile-my-status` (driver-only — корректно). `profile-push-filter` есть. Нет «Обновить приложение». Нет CarGoRuqSat row. |
| Queue tab | ✅ | Не отрисовывается у client'а — корректный canon. |

## Marketplace result (13 steps)

**End-to-end loop ✅** (backend curl proof, see `/tmp/regress_*` artifacts):

1. ✅ boris creates QA cargo (`[ar-regress-130720] Стройматериалы для теста`, Шымкент→Бишкек, 750000 KZT)
2. ✅ serik sees cargo in Feed via `/market/cargos`
3. ✅ serik submits bid 700000 KZT
4. ✅ **D12 fix verified**: boris (owner) sees 1 bid; auditor (non-owner) sees 0; anonymous sees 0; bidder serik sees 0
5. ✅ boris accepts bid → deal_id + chat_room_id created
6. ✅ boris sends `QA-MAESTRO-MESSAGE-130720`
7. ✅ serik unread = 1
8. ✅ serik reads room → unread = 0 (auto-mark-read on GET /messages)
9. ✅ serik replies `QA-MAESTRO-REPLY-130750`
10. ✅ boris unread = 1
11. ✅ boris opens room → unread = 0
12. ✅ both messages persist in `/chat/messages/{room_id}`
13. ✅ room visible in `/chat/rooms` for both sides

**UI side:** `unread-badge-flow.yaml`:
- `bottom-nav-chats-badge` visible after backend message arrives
- `deal-room-list-card` + `deal-room-list-unread` in Chats list
- Tap opens chat-room: **D2 fix verified** — header shows `Шымкент → Бишкек` + `Груз: [ar-regress-130720] Стройматериалы для те...` + `Ставка: 700000 KZT` (currency rendered!) + `Статус: accepted` + история сообщений
- After view, `bottom-nav-chats-badge` исчезает

## Chat / unread / push result

| | Result |
| --- | --- |
| In-app unread badge (`bottom-nav-chats-badge`) | ✅ shows on backend message arrival, dismisses on chat open |
| Per-room unread (`deal-room-list-unread`) | ✅ count "1" in green pill on card right |
| Auto-mark-read on GET /messages | ✅ confirmed via curl `unread` endpoint |
| Chat search bar | ✅ `deal-room-search` testID, placeholder «имя, компания, маршрут, груз, госномер» |
| Filter chips (`deal-room-filter-*`) | ✅ Все / Непрочитанные / Активные / Архив, все 4 видны |
| Empty state copy | ⚠️ «Напишите кому-нибудь — чат появится здесь» but no compose button (D9 P2 unfixed) |
| PushFilter screen | ✅ opens via `profile-push-filter`. 6 категорий toggles + Фильтр грузов (минимум тонн / минимум цена). Чисто, без crash. |
| **REAL IPHONE ONLY (NOT PROVEN)** | APNS delivery, lock-screen push, app icon badge, Apple permission dialog, background delivery |

## Queue result

| | Result |
| --- | --- |
| approved state for serik (level=3) | ✅ |
| `queue-title` testID на approved-ветке | ✅ (PR #99 added это) |
| `queue-cgr-link-approved` тап → CargoRuqsatInfo | ✅ |
| 4 border posts visible | ✅ Нуржолы / Достык / Кольжат / Бахты |
| Real-time status data (машин / часов / статус badge) | ✅ |
| 24–48h copy presence | ✅ static-gate подтверждает |
| Country chips | ⚠️ overflow с прокруткой, обрезано (D17 P3 unfixed) |
| RU plural «машин» vs «машины» | ⚠️ не согласовано (D7 P2 unfixed) |
| pending/gate state | NOT REACHABLE (serik approved). Нужен «свежий» actor без верификации. |

## Verification / PRO result

| | Result |
| --- | --- |
| Profile → My Status | ✅ открывает Security screen |
| Profile → PRO CTA | ✅ **D1 fix verified**: level≥2 → EditProfile «Профиль водителя» (НЕ Identity Шаг 1 из 5) |
| Identity step (доступ через verification-deep flow) | ✅ рендерится с полями ФИО / ИИН / DOB / Help / Photo + Продолжить CTA |
| Identity Help bottom sheet | ✅ 4 FAQ-секции: Требования к водителю / Как фотографировать / Сколько проверка / Заявка не прошла |
| EditProfile (D1 destination) | ⚠️ title «Профиль водителя» faded in light theme (новый P2 — см. defect table) |
| Steps 2–5 (Selfie/VehicleDocs/VehiclePhotos/TruckParams) | NOT REACHABLE — serik уже approved. Нужен fresh actor. |
| **REAL IPHONE ONLY** | реальная камера / галерея, OCR на снимках, Apple permissions, реальный document upload |

## Language / theme result

| | Result |
| --- | --- |
| i18n coverage (qa:i18n) | ✅ 0 missing × RU/EN/KK/ZH × 1392 keys |
| qa:ux gate | ✅ 28/28 |
| Live UI switch RU/EN/KK/ZH | ⚠️ Maestro+RN New Arch не индексирует язык-карты по тексту (нет testID на лангах). Lang switch выполняется руками; визуально RU подтверждён скриншотами. |
| Dark theme | NOT TESTED systematically (lang-switch flow заблокирован) |

**Recommendation P3:** добавить testID на lang-карты в `ProfileScreen.js` (`lang-card-ru/en/kk/zh`) и на theme-кнопки (`theme-light/dark`) — это разблокирует автоматизированный lang+theme regression.

## Defects

### P0 — none.

### P1 — none **active**. All previous P1 (D1/D2/D12) → **FIXED in PR #100**.

### P2 — все известные **остаются как было** (этот scope не включал P2 fixes):

| ID | Area | Status | Note |
| --- | --- | --- | --- |
| D3 | CreateTrip label «Страна» вместо «Откуда (страна, город)» | unfixed | i18n key fix |
| D4 | client Feed: tab «Машины», header «Рейсы» | unfixed | i18n key fix |
| D5 | Feed search placeholder одинаковый driver/client | unfixed | i18n + small render fix |
| D6 | CreateCargo/Trip placeholder «22»/«110» вместо «Например: 22» | unfixed | i18n key fix |
| D7 | Queue «N машин» plural несогласовано | unfixed | использовать `itemsWord` плюрализатор |
| D8 | Chats tab title «Чаты», page header «Сделки» | unfixed | name decision |
| D9 | Chats empty state «Напишите кому-нибудь» но нет compose | unfixed | i18n copy fix |
| D10 | MyWork «Пока нет рейсов» faded title | unfixed | style fix |
| D11 | MyWork двойной CTA «Опубликовать маршрут» | unfixed | UX decision |
| **D19 (new)** | **EditProfile title «Профиль водителя» faded in light theme** | **new finding** | `EditProfileScreen.js:284` использует `s.title` с `v1Typography.h1` где `color: v1Colors.text` (hardcoded white). Нужен `theme.text` через `useTheme()`. |

### P3 — все известные **остаются как было**:

| ID | Area | Note |
| --- | --- | --- |
| D13 | Chat-room «Принять ставку» disabled после accept | UI clean-up |
| D14 | Chat-room «Предложить це…» truncated label | font-size / label rewrite |
| D15 | Profile version hardcoded `v1.0.50 · 17.04.2026` | use `Constants.expoConfig.version` |
| D16 | Chat list status `ACCEPTED` latin in RU | localize |
| D17 | Queue country chips overflow | scroll indicator |
| D18 | Chat list timestamp UTC | local time |
| **D20 (new)** | **focus param `'pro'` в EditProfile никем не используется** | EditProfile открывается сверху; в будущем — scroll to / highlight PRO-section |

### NEW positive findings (no defect):
- D1/D2/D12 fixes от PR #100 **проверены вживую** — отдельный пример рассмотрен в каждом UI flow.
- in-app unread badge работает корректно end-to-end.
- marketplace loop полностью функционален для обеих сторон + двусторонний chat.
- Identity Help sheet хорош (понятный copy, 4 раздела FAQ).
- PushFilter screen полнофункциональный (6 категорий + фильтр грузов).

## Fixes made

Только новые QA artifacts в этом прогоне (никаких product-code изменений):
- `qa/maestro/unread-badge-flow.yaml` — новый flow для D2 + unread proof
- `qa/maestro/push-filter-flow.yaml` — новый flow для PushFilter
- `qa/maestro/lang-switch-flow.yaml` — новый flow (партиально работает)
- `qa/maestro/FULL_REGRESSION_REPORT_2026-06-10.md` — этот отчёт
- `qa/maestro/DEFECT_BACKLOG_2026-06-10.md` — добавлено D19/D20

P2 не правил (вне scope этой задачи).
P3 не правил.

## PR links

| PR | Status | Note |
| --- | --- | --- |
| #98 (stable selectors) | MERGED 2026-06-08 | в integration |
| #99 (safe QA auth path) | MERGED 2026-06-10 | в integration |
| #100 (P1 fixes D1/D2/D12) | MERGED 2026-06-10 | в integration |
| **#TBD (this regression report)** | OPEN | будет открыт ниже |

## Screenshots path

`qa/maestro/screenshots/full-regression-2026-06-10/` — **29 PNG** (gitignored).

Критичные доказательства:
- `02_chats_list_with_unread_card.png` — unread badge, deal card rich
- `03_chat_room_open_d2_proof.png` — **D2 fix LIVE: Шымкент→Бишкек / Груз / 700000 KZT**
- `02_after_pro_cta.png` — **D1 fix LIVE: EditProfile, не Identity**
- `04_chats_list_no_unread.png` — badge dismissed after open
- `01_push_filter_screen.png` — PushFilter полный
- `04_driver_queue.png` — real border data
- `06_driver_profile.png` — clean driver profile

## Is build 26 still blocked?

**🟢 NO. Build 26 — РАЗБЛОКИРОВАН.**

- ✅ Все 3 P1 (D1/D2/D12) закрыты в PR #100, проверены вживую и через backend curl.
- ✅ Marketplace loop end-to-end работает.
- ✅ Chat unread badge корректный.
- ✅ Static gates все 14 PASS.
- ✅ Никаких новых P0 / P1 не найдено в этом прогоне.
- ⚠️ 9 P2 остаются как улучшения (не блокеры) — рекомендую batched UX-PR.
- ⚠️ 1 новый P2 D19 (EditProfile faded title in light theme) — нужно фиксить до пилот-рассылки клиентам, но не блокирует build 26.

## Exact owner command

```bash
# Просмотреть отчёт + скриншоты
cat qa/maestro/FULL_REGRESSION_REPORT_2026-06-10.md
open qa/maestro/screenshots/full-regression-2026-06-10/

# Если устраивает — открыть PR с новыми Maestro flows + отчётом
gh pr view <TBD>

# При готовности резать build 26 — integration → main merge ВРУЧНУЮ через GitHub UI
# (auto-mode classifier блокирует прямой gh pr merge для main; см. PR #100 предысторию).

# Опциональные следующие шаги:
# 1) Batched UX P2 fix PR (D3/D4/D5/D6/D7/D9/D10/D11/D19) — однострочные i18n + один theme fix.
# 2) Fresh-actor verification flow — добавить `fresh` actor в `backend/api/qa.py` с level=0 для проверки шагов Selfie/VehicleDocs/VehiclePhotos/TruckParams.
# 3) testID на ProfileScreen lang-cards и theme buttons — разблокирует автоматизированный i18n+theme regression в Maestro.
```
