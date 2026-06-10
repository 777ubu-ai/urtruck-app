# UrTruck — Maestro QA defect backlog (2026-06-10)

Source: 4-hour autonomous Maestro QA pass on integration HEAD
`origin/claude/youthful-cerf-barf3 = 3ec23ff` + PR #99 (`test/maestro-qa-auth-path`,
committed on `09d2c0f`).

Environment:
- iPhone 17 / iOS 26.4 simulator (UUID 3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F)
- Expo Go SDK 52, Bridgeless + New Architecture
- Local backend at `http://127.0.0.1:8001`, `URTRUCK_ENV=development`
- `EXPO_PUBLIC_API_URL=http://127.0.0.1:8001`
- QA actors: serik (driver), boris (client), auditor — all `verification_level=3`, `status='approved'`

Screenshots: `qa/maestro/screenshots/run-1131/`

## Status update (2026-06-10 PR `fix/p1-maestro-qa-findings`)

P1 фиксы D1, D2, D12 — все три **FIXED** и проверены локально.
Подробные root cause + fix summary см. в строках таблицы ниже + в PR description.

## Defect table

| ID | Sev | Role | Area | Actual | Expected | Evidence | Fix | Safe now? | iPhone-only? | Backend? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | **P1 → FIXED** | driver | Profile → PRO | «Получить статус PRO» ведёт в `Identity` (полная регистрация: Шаг 1 из 5). Для уже approved актёра — это пройденный флоу. | Должен открывать отдельную PRO-форму с 4 расширенными полями (`legal_form`, `china_experience_years`, `favorite_borders`, `emergency_contact`), которые считаются в `proFilled`. | `02_after_pro_cta_small.png`, `03_identity_top_small.png`. Source: `src/screens/ProfileScreen.js:261` `onPress={() => navigation.navigate('Identity')}` | **DONE.** `src/screens/ProfileScreen.js`: достали `verificationLevel` из `useAuth()`. PRO CTA теперь: `level >= IDENTITY(2)` → `navigation.navigate('EditProfile', { role, focus: 'pro' })`; иначе сохранилось старое `navigate('Identity')` (новый водитель — Identity необходим). EditProfile уже содержит 4 PRO-поля (legal_form / china_experience_years / favorite_borders / emergency_contact). Proof: `qa/maestro/screenshots/p1-fixes-2026-06-10/02_after_pro_cta.png` — landed на EditProfile «Профиль водителя». | Да | Нет | Нет |
| D2 | **P1 → FIXED** | both | Deal chat-room | После accept в шапке chat-комнаты `Груз —` и `Ставка —` пустые (em-dash вместо значений), хотя bid=1100000 KZT + cargo desc известны. | Должны рендериться: `Груз: Электроника тестовая партия`, `Ставка: 1 100 000 KZT`. | `03_chat_room_open.png`. | **DONE.** Корень: `ChatScreen.js` populated `deal` state только из `route.params`. Когда юзер открывал deal-room через `ChatsListScreen.navigate('Chat', { partner, roomId, dealId, role })` — `fromCity/toCity/cargoDesc/amount` не передавались. Backend `GET /market/deals/{id}` отдавал только `from_city`/`to_city`/`amount`, без `cargo_desc`/`currency`. **Frontend fix** (`src/screens/ChatScreen.js`): дотягиваем `marketAPI.getDeal(dealId)` и сливаем пустые поля. **Backend fix** (`backend/api/marketplace.py` `get_deal`): добавлен LEFT-JOIN cargos для `cargo_desc`+`currency`, JOIN trips для `plate_truck`. Никаких подделок: если backend → `null`, остаётся `—`. **DealRoomCard** теперь рендерит amount + currency (`820000 KZT`). Proof: `qa/maestro/screenshots/p1-fixes-2026-06-10/03_chat_room_open.png` — все поля на месте. | Да | Нет | Да |
| D3 | **P2** | driver | CreateTrip | Лейбл первого поля = `Страна` (без префикса «Откуда»), второго = `Куда (страна, город)`. Несимметрично. | Обе — `Откуда (страна, город)` / `Куда (страна, город)`, либо обе без префикса. | `03_after_publish_trip_tap.png`. | `src/utils/i18n.js` ключ `fromCountry` → выправить на «Откуда (страна, город)». | Да (1-строчный i18n fix) | Нет | Нет |
| D4 | **P2** | client | Feed (Машины) | Tab называется «Машины», но заголовок страницы — «Рейсы». | Совпадение: либо tab «Рейсы», либо header «Машины». Лучше «Машины» в обоих местах — пользователь ищет машину. | `02_client_feed.png` (client side). | `FeedScreen.js` — заголовок зависит от role; для client давать `tab_feed_client` или единый ключ `client_feed_title`. | Да | Нет | Нет |
| D5 | **P2** | both | Feed search | Поле поиска: `Поиск: имя, компания, маршрут, груз, госномер` одинаковое и у driver Feed и у client Feed. | Driver ищет грузы → placeholder про грузы. Client ищет рейсы/машины → placeholder про машины и водителей. | `02_driver_feed.png`, `02_client_feed.png`. | i18n ключ `chat_search_placeholder` или отдельный для каждой роли. | Да | Нет | Нет |
| D6 | **P2** | both | CreateCargo / CreateTrip | placeholder для «Вес, т» = `22`, для «Объём, м³» = `110`. Выглядят как реальные значения, не подсказки. | Должно быть `Например: 22` / `Например: 110` (fallback в коде уже так). | i18n.js строки 915–916, 1681–1682, 2852–2853, 4137–4138. `weight_placeholder: '22'` → `'Например: 22'`. | `src/screens/CreateCargoScreen.js:334,344`. | Да (4 i18n строки) | Нет | Нет |
| D7 | **P2** | driver | Queue | Counter «152 машин» / «157 машин» / «81 машин» — числительные не согласованы (по RU должно быть «машины» для 2/3/4 и «машин» для 0/5+). | Плюрализация по последней цифре. | `04_driver_queue.png`. | Использовать существующий `itemsWord` плюрализатор из `ProfileScreen.js:163` для машин. | Да | Нет | Нет |
| D8 | **P2** | driver | Chats | Tab title «Чаты», но заголовок страницы «Сделки». | Должен совпадать. Стратегически лучше «Сделки» (deals — продуктовый термин), tab переименовать в «Сделки». | `05_driver_chats.png`. | Заменить i18n `tab_chats` → `Сделки` или переименовать `chat_title` → `Чаты`. | Нет (требует решения owner — название табы вшито в product-канон) | Нет | Нет |
| D9 | **P2** | driver | Chats empty state | Текст «Напишите кому-нибудь — чат появится здесь». Но compose-кнопки нет. | Либо изменить копию (например, «Когда у вас будут активные сделки, чаты появятся здесь»), либо добавить compose. | `05_driver_chats.png`. | i18n ключ `chats_empty`. | Да | Нет | Нет |
| D10 | **P2** | driver | MyWork empty state | Заголовок «Пока нет рейсов» отрендерен с очень низкой непрозрачностью (выглядит как баг анимации/опечатка). | Solid color или явный muted style. | `03_driver_mywork.png`. | `MyTripsScreen.js` — проверить styles.emptyTitle. | Да | Нет | Нет |
| D11 | **P2** | driver | MyWork CTA дубль | Два «Опубликовать маршрут» CTA: один сверху, один в empty-state. | Один CTA. В empty-state — основной, сверху — убрать (или сделать иконкой). | `03_driver_mywork.png`. | `MyTripsScreen.js`. | Нет (требует UX-решения) | Нет | Нет |
| D12 | **P1 → FIXED** | both | Bids public list | `GET /api/v1/market/bids?cargo_id=X` возвращает 0 даже владельцу cargo, если bid создан агентом (`agent-*`). | Owner cargo'а должен видеть все bids на свой груз, независимо от `bidder_id` prefix. | `backend/api/marketplace.py:778` `DIRTY_BIDDER_PREFIXES`. | **DONE.** `backend/api/marketplace.py` `list_bids`: добавлен optional `Authorization` header + хелпер `_maybe_user()` (никогда не raise). Если caller аутентифицирован И является owner'ом `cargo_id` (или `driver_id` для `trip_id`) — обходим `DIRTY_BIDDER_PREFIXES`. Public/anonymous/non-owner всё ещё получают filtered view (T1/T2/T3 в curl proof). Owner получает все active-bids (но не cancelled/rejected). **Authorization не ослаблена**: optional header — не aviolating, public path не изменился. **QA данные не утекают публично**: только owner своего cargo. Proof: 4-state curl matrix (anon=0, auditor=0, bidder=0, owner=1). | Да | Нет | **Да** |
| D13 | **P3** | both | Chat-room actions | Чип «Принять ставку» подсвечен как disabled, при том что bid уже accepted (отдельный pill «Ставка принята»). | Скрыть или перерейзить → «Изменить решение». | `03_chat_room_open.png`. | DealRoom actions condition. | Да | Нет | Нет |
| D14 | **P3** | both | Chat-room actions | Чип «Предложить це...» — truncated label «Предложить цену». | Уменьшить шрифт или сократить до «Цена» или дать `numberOfLines={1}` + ellipsis. | `03_chat_room_open.png`. | DealRoom actions. | Да | Нет | Нет |
| D15 | **P3** | both | Profile version | «v1.0.50 · 17.04.2026» — захардкожено инлайном в `ProfileScreen.js:383,386`. На 2026-06-10 версия выглядит устаревшей. | Читать `Constants.expoConfig.version` + `nativeBuildVersion`. | `06_driver_profile.png`. | `src/screens/ProfileScreen.js`. | Да (1 строка) | Нет | Нет |
| D16 | **P3** | both | Chat status | На карточке deal-room статус `ACCEPTED` латиницей, остальной UI — RU. | Локализовать через i18n. | `02_chats_with_deal.png`. | `ChatsListScreen.js`. | Да | Нет | Нет |
| D17 | **P3** | driver | Queue chips | Country chips сверху обрезаются — видны KZ + ✕КЗ + Россия + Узбекистан полу-обрезано. | Шире, либо явный horizontal scroll indicator. | `04_driver_queue.png`. | `QueueScreen` filters styles. | Да | Нет | Нет |
| D18 | **P3** | driver | Chat list time | На карточке chat-room время `06:50` — UTC. Локально (Алматы UTC+5) это `11:50`. | Локальное время. | `02_chats_with_deal.png`. | `ChatsListScreen.js` `time` formatter. | Да | Нет | Нет |

## Манипуляции с продукцией кода
- **Самостоятельно НЕ исправлял ничего.** Это аудит. Все правки — только в новых файлах под `qa/maestro/` (новые flow и логи).
- **Защита от загрязнения БД** прода: все QA cargos/bids/chats шли только в локальный `backend/database/security.db`. Маркеры `[ar-maestro-*]` подхватываются существующим `qa/cleanup` endpoint.
- **PR #99 review (PHASE 0)**: безопасен для merge в integration. Все 14 static gates PASS. Реальный OTP-флоу (`PhoneV2`/`OtpV2`/`regAPI`) не тронут. Backend / package / app.json не тронуты. AppNavigator/BottomNav не тронуты. Production-бандл не показывает QA-хук (`__DEV__ && appOwnership !== 'standalone'`).

## Кнопки/UX improvements list (отдельный список)
1. CreateTrip — выравнять лейблы From/To (D3).
2. CreateCargo/Trip — placeholder «Например: 22» (D6).
3. Feed-search — отдельные placeholder для driver/client (D5).
4. Queue — плюрализация «машины» (D7), chip overflow indicator (D17).
5. MyWork — убрать дубль CTA (D11), починить empty-state стиль (D10).
6. Chats — название tab vs header (D8), empty-state-копия (D9).
7. ChatRoom — заполнить «Груз» и «Ставка» (D2), скрыть «Принять ставку» после accept (D13), label «Цена» (D14), локализовать «ACCEPTED» (D16), локальное время (D18).
8. Profile — версия из manifest (D15).

## Logic improvements list
- **PRO CTA destination (D1, P1)**: разделить PRO-форму и регистрацию.
- **Public bids list (D12, P1)**: owner всегда должен видеть bids на свой cargo.
- **QA-actor визуальная гигиена**: имена «Boris (shipper agent)» / «Serik (driver agent)» утекают в публичный feed/chat title. Допустимо для QA, но если actor создаст deal — другая сторона видит «(shipper agent)» в шапке. Можно — для test-actors — рендерить «Test Shipper» без слова «agent».

## Navigation ownership list (canon из CLAUDE.md)
| Tab | Driver | Client |
| --- | --- | --- |
| Feed | Грузы (cargo list) | Машины (truck list) |
| MyWork | Рейсы (my trips) | Грузы (my cargos) |
| Queue / Publish | Очередь (CarGoRuqSat) | + Разместить (CreateCargo) |
| Chats | Сделки (deal rooms) | _скрыта_ |
| Profile | Профиль | Профиль |

Canon **подтверждён** в этом прогоне: 5 driver-табов / 4 client-таба, без перекрёстных утечек.

## Manual iPhone-only list (NOT PROVEN on simulator)
- Камера и галерея (`expo-image-picker` `launchCameraAsync`, `launchImageLibraryAsync`) — на симуляторе нет физической камеры. Кнопка «Добавить фото» отрисовывается (см. `03_identity_top_small.png`), но успех уплоада не проверяем.
- TestFlight bundle (production бандл, `__DEV__===false`) — поведение `signOut`, `AuthContext` рестора при холодном старте.
- iOS Apple permissions диалоги: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription` — текст копий в `app.json` ОК, но реальное появление диалога нужно на железе.
- Push (`expo-notifications`) — в Expo Go SDK 52 отключён. Реальный APNs token, deep-link с push на deal-чат — требует dev-client или TestFlight.
- `urtruck://` deep link из системы — Expo Go использует только `exp://`.
- OCR (`backend/ocr/`, `pytesseract`) — на симуляторе не тестируем (нет реальных фото из камеры).
- Реальный whatsapp-OTP (`backend/services/whatsapp_service.py` живой режим) — не подключен в local QA.

## What was NOT proven (нужно повторно прогнать)
- KK / EN / ZH локализация — переключали бы в Profile, но не делалось в этом прогоне (приоритет P0/P1 в backlog выше).
- Dark mode на всех экранах — Profile toggle есть, но систематический проход не делали.
- Шаги 2–5 регистрации (Selfie / VehicleDocs / VehiclePhotos / TruckParams) — отрисовка не проверена, потому что для serik они уже пройдены (auto-approved actor). Нужен «свежий» actor без верификации.

## Recommended next action

**Не мержить в main.** Сначала закрыть P1.

Приоритет:
1. **D1 (PRO CTA logic)** — решение product owner (отдельный PR на `src/screens/ProfileScreen.js` после ТЗ).
2. **D12 (public bids list для owner)** — backend hotfix (`marketplace.py:_filter_dirty_bidders`).
3. **D2 (chat-room «Груз — / Ставка —» empty)** — расследование `DealRoomScreen` mapping.
4. **D3–D11 (P2 UX-batch)** — один общий PR `chore(ux): batch fixes Q2-2026 from Maestro audit`.
5. После P1+P2 закрытия — PR-bundle integration → main.

## Exact next owner command

```bash
# 1. Глянуть отчёт
open qa/maestro/screenshots/run-1131
cat qa/maestro/DEFECT_BACKLOG_2026-06-10.md

# 2. Смержить PR #99 в integration (если устраивает security review)
gh pr merge 99 --merge

# 3. Открыть P1 issues:
gh issue create --label "P1,product" --title "Profile → PRO CTA leads to full Identity flow"
gh issue create --label "P1,backend" --title "Bids list hides agent-* bidders even from cargo owner"
gh issue create --label "P1,frontend" --title "Deal chat-room shows empty Груз/Ставка after accept"

# 4. После фиксов — повторить прогон:
cd backend && URTRUCK_ENV=development QA_AGENT_TOKEN=$(openssl rand -hex 32) \
  DB_PATH=$PWD/database/security.db STORAGE_LOCAL_ROOT=$PWD/storage \
  STORAGE_LOCAL_PUBLIC_BASE=/storage \
  python -m uvicorn main:app --host 127.0.0.1 --port 8001 &
cd ..
export MAESTRO_QA_AGENT_TOKEN=$QA_AGENT_TOKEN MAESTRO_BACKEND_BASE=http://127.0.0.1:8001/api/v1
cd qa/maestro/screenshots
for f in driver-auth driver-deep client-auth verification-deep verification-authenticated \
         createcargo-authenticated marketplace-driver-chat; do
  bash ../_lib/clean-state.sh
  maestro test ../$f.yaml
done
```
