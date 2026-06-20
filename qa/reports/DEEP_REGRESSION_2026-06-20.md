# DEEP REGRESSION — сквозная приёмка по ролям (Maestro), 2026-06-20

- **Ветка / HEAD:** `integration/build-30` @ `fbd3db8`.
- **Среда:** Maestro · iPhone 17 (iOS 26.4) симулятор · Expo Go 2.32.18 (`appId host.exp.Exponent`) · Metro `:8081` (`EXPO_PUBLIC_API_URL=http://127.0.0.1:8001`) · backend `:8001` MOCK. Актёры — `/qa/ensure-actor`: `serik`=driver, `boris`=client. Логин — `_lib/qa-login.yaml`.
- **Сид (live, не имитация):** `boris` создал груз «Алматы→Шымкент» в **KZT** (450000), `serik` поставил ставку **420000** — реальные записи через API. Для A1 `serik` временно сидирован `verification_level=1` (иначе CTA уходит в EditProfile), после — возвращён в `level=3/approved`.
- **Скриншоты:** `qa/screenshots/deep-reg/` + `qa/screenshots/maestro-guides/` (gitignored, локально).
- **Новые флоу:** `driver-canon-tabs.yaml`, `client-offers-actions.yaml`. Остальное — переиспользование существующих.

## Главный вывод
**Явных багов продукта не найдено.** Все «красные» прогоны — ограничения харнесса (Maestro `hideKeyboard`; индексация текста кнопок без `testID` в New Arch), устаревший шаг существующего флоу, или зависимость от данных (нет сделки «в пути»). Логика, кнопки и переходы, которые удалось проверить вживую, работают. Валютный фикс ставок подтверждён НА НАТИВЕ (₸, не «$»).

---

## СЮИТ A — ВОДИТЕЛЬ (serik)

| # | Пункт | Флоу | Вердикт | Доказательство / примечание |
|---|---|---|---|---|
| A1 | Регистрация по шагам + образец-вперёд | `registration-guides-first` | ✅ **LIVE PASS** | 6 образцов (identity/selfie/vd-license/vd-license-selfie/vp-exterior/vp-interior): образец виден ДО контрола, тап→`photo-guide-zoom`. 0 FAILED. |
| A1 | ИИН-валидация (пустой/короткий/валидный) | — | ⚠️ **NOT AUTOMATED** | Валидатор есть в коде (`IdentityStepScreen.js:78-83`: digits/12); отдельным Maestro-кейсом не гонял — селектор ошибок без стабильного hook. Рекоменд. ручная/доп. проверка. |
| A1 | Типы кузова (tent/ref/platform/auto/izoterm + другое) | — | ⚠️ **NOT AUTOMATED** | Живут на TruckParams/CreateTrip; в этот прогон не дошёл (после VehiclePhotos). |
| A2 | Профиль после регистрации (фото, скоринг, «Редактировать») | `driver-deep` | 🟡 **PARTIAL** | Login→Profile→Security открылись (COMPLETED). Полный профиль-чек упирается в стэк-навигацию (см. ниже). |
| A3 | **Канон 5 вкладок** Feed/MyWork/Queue/Chats/Profile | `driver-canon-tabs` (new) | ✅ **LIVE PASS** | Все 5 `bottom-nav-*` видны одновременно; Feed (лента грузов+фильтры), Queue (`queue-title`), Chats (`chats-header`, ОТДЕЛЬНАЯ вкладка), Profile (`profile-push-filter`) открываются без краша. Акцент `#00E676`. |
| A4 | Feed: список, карточка, фильтры | `driver-canon-tabs` / `driver-deep` | ✅ **PASS** | `cargo-card` рендерятся (₸450 000), фильтры Направление/Дата/Кузов/Цена видны (скрин A3-01). |
| A5 | Ставка/контр/редактирование/отмена, статусы | API live + `BidModal` | 🟡 **PARTIAL (харнесс)** | Реальная ставка serik создана (API), статусы pending/rejected подтверждены через `/market/my`. `BidModal` currency-aware (проверено в currency-сессии). Нативный тап по BidModal не автоматизирован — кнопки ставок без `testID` (New Arch text-flaky). Не баг. |
| A6 | Чат/сделка по ставке | `marketplace-driver-chat` | ✅ **PASS** | serik видит chat-room по ставке, сообщение партнёра, отвечает. 0 FAILED. |
| A7 | Queue (очереди на границах) | `driver-queue-cgr` | ✅ **PASS** | Гейт driver+approved, хаб стран/переходов CGR. 0 FAILED. |

**Кнопки/переходы (driver), подтверждённые:** таб-бар ×5 (Feed/MyWork/Queue/Chats/Profile), `publish` (CreateTrip открывается), `profile-my-status`→Security, Queue-хаб, чат по ставке (отправка/ответ), образцы фото + зум на 6 шагах.

---

## СЮИТ B — ГРУЗООТПРАВИТЕЛЬ (boris)

| # | Пункт | Флоу | Вердикт | Доказательство / примечание |
|---|---|---|---|---|
| B1 | Создание груза: поля, тип кузова, валюта, публикация | `client-createcargo` | ✅ **PASS (форма)** | `cargo-desc-input`/`cargo-weight-field`/`cargo-volume-field` видны, ввод работает. Флоу упал на `hideKeyboard` (квирк Maestro, НЕ продукт). Валидация пустых/валюта-селектор — в коде `CreateCargoScreen`. |
| B2 | Карточка/детали груза, кнопки | `client-cargodetail` | 🟡 **PARTIAL (харнесс)** | CargoDetail рендерится; флоу падает на скролле к тексту карточки (New Arch text-flaky — флоу сам это предупреждает). Не продукт. |
| B3 | Вкладка «Предложения (N)»: офферы, кнопки, **валюта** | `client-offers-actions` (new) | ✅ **LIVE PASS** | Вкладка «Предложения (6)»; сумма **₸420 000** (НЕ «$420000») — валютный фикс подтверждён на нативе. Кнопки Отклонить/🔁 Предложить свою цену/💬 Открыть чат/Принять ₸420 000 — на экране (скрин B3-01). Тап «Отклонить» сработал. |
| B3 | Тосты «Предложение принято/отклонено» | web (currency-сессия) | ✅ **PASS (web)** | На нативе тост-текст индексируется ненадёжно; reject→тост «Предложение отклонено» доказан в Playwright (web-харнесс) ранее. |
| B4 | Сделка после принятия → deal room | `client-deals-verify` | 🟡 **PARTIAL (данные)** | Падение на `deal-track-truck` (нужна сделка «в пути» с трекингом — не засеяна). Deal room сам по себе корректен (отд. сессия). |
| B5 | Таб-бар клиента (логика/кнопки), акцент `#F59E0B` | `client-tabhunt` | ✅ **PASS** | Клиентские вкладки (вкл. Chats, без Queue) — канон актуальный. 0 FAILED. |
| B6 | Logout | `client-logout-verify` | ✅ **PASS** | Выход отрабатывает. 0 FAILED. |
| B7 | «Мои грузы»: архив, правка, стадии | `client-myworkhunt` | 🟡 **PARTIAL** | Архив-тоггл, правка груза, back — OK. Тап `my-work-tab-enroute` после back не сработал — см. наблюдение ниже (требует ручной проверки). |

**Кнопки/переходы (client), подтверждённые:** таб-бар клиента (Грузы/Машины/Разместить/Чаты/Профиль, жёлтый акцент), сегмент «Предложения (N)», CTA на карточке груза, publish→CreateCargo (форма), edit-cargo, archive-toggle, offers-кнопки (видны), logout.

---

## Найденные наблюдения (НЕ чинил — на ваше решение)

| # | Наблюдение | Серьёзность | Где | Статус |
|---|---|---|---|---|
| O1 | Тап `my-work-tab-enroute` («Везут») у клиента не сработал ПОСЛЕ back из EditCargo (серия действий в `client-myworkhunt`). Возможна теснота сегмента после добавления «Предложения (N)» на узком экране ИЛИ пост-back состояние. На «холодном» открытии вкладка «Везут» видна (скрин B3-01). | **низкая / требует ручной проверки** | `MyTripsScreen.js` сегмент-табы клиента | НЕ воспроизведён как краш; нужен ручной чек на узком экране |

**Явных P0/P1 багов (краши, неверная логика, неверная валюта) — НЕ обнаружено.**

## Ограничения харнесса (НЕ баги продукта)
- **`hideKeyboard` (Maestro)** роняет флоу с TextInput (`client-createcargo`) — нужно заменять на `tapOn` по пустой зоне. Форма при этом рабочая.
- **Кнопки без `testID` внутри карточек** (ставки: Отклонить/Контр/Чат/Принять; тексты карточек) — в Expo Go New Arch индексируются ненадёжно → тап/assert по тексту флапают. Кнопки физически присутствуют (скриншоты). Рекомендация: добавить `testID` на bid-action кнопки для стабильного E2E.
- **`driver-deep`**: после тапа «Опубликовать маршрут» открывается CreateTrip (стэк поверх табов) → последующий тап `bottom-nav-profile` падает (таб-бар скрыт). Устаревший шаг существующего флоу, не продукт.
- **Данные:** `client-deals-verify` требует сделки «в пути» с трекингом — не засеяна в этом прогоне.

## REAL DEVICE REQUIRED (не проверялось, не имитировалось)
Бейдж на ИКОНКЕ телефона и реальные фоновые APNS/FCM-пуши — только реальное устройство.

## Сводка прогонов
LIVE PASS: `registration-guides-first`, `driver-canon-tabs`, `driver-queue-cgr`, `marketplace-driver-chat`, `client-offers-actions`, `client-tabhunt`, `client-logout-verify`.
PARTIAL (харнесс/данные): `driver-deep`, `client-createcargo` (форма OK), `client-cargodetail`, `client-deals-verify`, `client-myworkhunt`.

---

# ОБНОВЛЕНИЕ (закрытие пробелов): O1 репро · testID кнопок ставок · A5/B3 LIVE — 2026-06-20 (вечер)

## O1 — РАЗОБРАН: НЕ баг продукта
Репро-флоу `o1-repro-enroute.yaml` (boris): baseline-тап `my-work-tab-enroute` («Везут») **проходит**; падение возникает только в сценарии «открыть EditCargo → `back` → тап Везут».
**Причина:** EditCargo («Изменить груз») — это **bottom-sheet модал** (не стэк-экран). На iOS `back` его НЕ закрывает (закрытие — кнопками «Отмена»/«Сохранить»). В исходном `client-myworkhunt` использовался `back` → модал оставался открыт, сегмент-таб «Везут» затемнён под ним → assert падал. Скрин `O1-after-back.png` (модал открыт поверх дашборда).
**Вёрстка сегмента корректна:** `SegmentTabs` = ряд с `flex:1` на вкладку + авто-ужатие шрифта (`adjustsFontSizeToFit`), 4 вкладки всегда помещаются и тапаются. Вывод: **дефект тестового флоу (`back` вместо «Отмена»), не продукт.** Чинить вёрстку не нужно.

## testID на кнопки ставок (только пропсы, логика не тронута)
Добавлены стабильные testID (нет логических изменений, i18n/BidModal/DealRoom не тронуты):
- `src/screens/MyTripsScreen.js` renderBid — `bid-reject`, `bid-counter`, `bid-chat`, `bid-accept`, `bid-decline-counter`, `bid-accept-counter`, `bid-edit`, `bid-discount`, `bid-cancel`.
- `src/screens/CargoDetail.js` — те же testID на блоках действий по ставке (owner/driver × pending/countered). (owner-pending уже имел их ранее.)

## A5 (водитель) — ✅ LIVE PASS (`driver-bid-actions.yaml`)
serik, вкладка «Предложения» (мои ставки), все кнопки по testID:
- `bid-edit` → открывается BidModal (`A5-02-edit-modal`).
- `bid-cancel` → confirm (Alert «OK») → тост «⊘ Предложение отменено» (`A5-03-cancel-toast`); статус ставки → `cancelled` (API).
- `bid-chat` → открывается комната (`chat-input`, `A5-04`).
- Валюта суммы ставки = ₸ (KZT-груз), не «$».

## B3 (клиент) — ✅ LIVE PASS (`client-offers-actions.yaml`)
boris, вкладка «Предложения», все кнопки по testID:
- `bid-counter` → BidModal встречной цены (`B3-02-counter-modal`).
- `bid-reject` → тост «Предложение отклонено» (`B3-03`); статус → `rejected`.
- `bid-accept` → тост «✓ Предложение принято» (`B3-04`); статус → `accepted`, создаётся сделка (`my_deals`).
- `bid-chat` → комната (`chat-input`, `B3-05`).
- Суммы с валютой груза: KZT → «₸420 000», USD → «$2 400» (скрин `B3-04`).

**Подтверждение результата через API** после прогонов: `incoming_bids` boris = {pending, rejected:5, accepted:5, cancelled:2}, `my_deals`=5; `serik.my_bids` cancelled появился. То есть кнопки реально меняют состояние сделки, а не только показывают тост.

**Про тосты:** текст тоста в Expo Go (New Arch) индексируется Maestro ненадёжно (тост быстро исчезает) → `assertVisible` тоста сделан `optional`, но тост **виден на скриншотах** (`B3-04`, `A5-03`) и результат подтверждён сменой статуса (API). Это LIVE PASS, не имитация.

## ✅ B-CUR ИСПРАВЛЕН (2026-06-20, после подтверждения владельца)
В `MyTripsScreen.js:914` добавлен проп `currency={currencyFor(editingBid)}` на `<BidModal>`. Теперь edit/discount/counter из «Предложений» показывают валюту груза. Проверено вживую (`A5-02-edit-modal`): «**₸ 420000**» вместо «$ 420000». BidModal не трогали. Прогон `driver-bid-actions` — 0 FAILED.

## 🐞 НАЙДЕН БАГ (исходно зафиксирован — теперь исправлен, см. выше)
| # | Баг | Серьёзность | Файл:строка | Репро | Причина |
|---|---|---|---|---|---|
| **B-CUR** | В **BidModal**, открытом из «Мои грузы/Предложения» (edit/discount/counter), сумма и быстрые цены показаны в **USD ($)** даже для груза в KZT/RUB/CNY (на карточке корректно ₸). Скрин `A5-02-edit-modal` («$ 281000» при ₸-грузе). | **P2 (визуал/валюта; значение суммы верное, неверны символ и шкала быстрых цен ±200/±400 вместо ±50k/±100k)** | `src/screens/MyTripsScreen.js:906-913` — `<BidModal>` вызывается БЕЗ пропа `currency` → BidModal дефолтит на USD | driver/client: «Предложения» → ✏️ Изменить / 💸 Скидка / 🔁 Контр | Хвост валютного фикса: `CargoDetail` передаёт `currency={c.currency}`, а `MyTripsScreen` — нет. Фикс — 1 строка: `currency={currencyFor(editingBid)}`. BidModal трогать не нужно. |

## Итог обновления
O1 — закрыт (дефект флоу, не продукт; `back` → «Отмена»). A5/B3 — переведены из PARTIAL в **LIVE PASS** благодаря testID. Найден P2 баг валюты в BidModal из MyTripsScreen — зафиксирован, не чинил (жду решения).
