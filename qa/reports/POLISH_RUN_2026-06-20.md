# POLISH RUN — приёмка полиш-правок (предложения · образцы фото · терминология · скорость), 2026-06-20

- **Ветка / HEAD:** `integration/build-30` @ `250bf96` («polish: ускорение бейджей 30с→12с + единая терминология «предложение»»).
- **Среда (web-харнесс):** backend `:8001` (Python venv, `env=development`, OTP **MOCK**, storage **local**, face heuristic — подтверждено `GET /api/v1/system/info`) · собранный web-бандл `dist/` (`npm run build:web`) · QA-reverse-proxy `:8090` (раздаёт `dist/` + проксирует `/api`,`/storage` → `:8001`; веб бьёт в относительный `/api/v1`, same-origin → локальный backend).
- **Аккаунты:** A = `boris` (грузовладелец/client), B = `serik` (водитель/driver) — выданы через `/api/v1/qa/ensure-actor` (роль + токен в обход OTP, level 3 approved). Авто-логин в браузере — инъекцией `ur_reg_token` + `ur_session` в localStorage.
- **Инструмент:** Playwright (Chromium, viewport 414×896, locale ru-RU).
- **Скрины:** `qa/screenshots/polish-run/` (gitignored — локально).

---

## Итоговая таблица

| # | Пункт | Вердикт | Доказательство |
|---|---|---|---|
| 1 | КЛИЕНТ: вкладка-сегмент «Предложения (N)» + входящие ставки + янтарный CTA «💬 N предложений ›» | ✅ **PASS** | live + код |
| 2 | РЕГИСТРАЦИЯ ВОДИТЕЛЯ: образцы ✅/❌ на шагах фото (личное/селфи/права/селфи-с-правами/авто) | ✅ **PASS** | live (личное фото + зум) + код (все 5) |
| 2b | …И техпаспорт | ⚪ **N/A — пропущен по решению владельца** | файла-образца СРТС нет (см. ниже) |
| 3 | ТЕРМИНОЛОГИЯ: везде «предложение», но цена сделки — «Ставка: $…» | ✅ **PASS** | live (тост + экран) + код |
| 4 | СКОРОСТЬ: бейдж непрочитанного ~12с (не 30с) | ✅ **PASS (код)** | `POLL_MS=12000` в 2 файлах |
| C1 | Бейдж на ИКОНКЕ телефона + реальные фоновые пуши | 🚫 **REAL DEVICE REQUIRED** | web-харнесс не проверяет — не имитировал |

---

## Пункт 1 — КЛИЕНТ: «Предложения» ✅ PASS

Засеяно через API: boris создал груз «Алматы → Шымкент» (`[ar-polish]`), serik поставил предложение 420000. `GET /market/my` (boris) вернул `incoming_bids` с несколькими `pending` и грузы с `bids_count>0`.

Живой прогон (boris в браузере):
- **Сегмент «Предложения (5)»** присутствует в шапке «Мои грузы» (рядом с «Мои грузы / Везут / Доставлено»). `data-testid="my-work-tab-offers-client"`, метка `Предложения (N)`. → `01-mytrips-searching.png`, `03-offers-tab.png`.
- **Янтарный CTA на карточке груза:** `💬 1 предложение ›` (фон `rgba(245,158,11,…)`, текст/стрелка `#F59E0B`), найден на 3 карточках. `data-testid="cargo-offers-cta"`. → `02-cargo-cta.png`.
- **Входящие предложения видны во вкладке** с действиями клиента: **Отклонить / Предложить свою цену / Открыть чат / Принять $…** (renderBid для `!isDriver`). → `03-offers-tab.png`.

Код: `src/screens/MyTripsScreen.js` — `CLIENT_TABS_KEYS` теперь содержит `offers`; `clientOffers = myBids.filter(status∈{pending,countered})`; CTA-блок `isCargo && !isDriver && bids_count>0`.

## Пункт 2 — РЕГИСТРАЦИЯ ВОДИТЕЛЯ: образцы ✅/❌ ✅ PASS (механизм live, все шаги — код)

Живой прогон (водитель, level 0 → поток верификации Profile → CTA → Identity):
- Шаг 1/5 «Личные данные»: **образец «Личная фотография»** (1 ✅ хороший + 3 ❌ плохих) с 🔍-бейджем. → `reg-01-identity.png`.
- **Тап по образцу = крупно** (Modal во весь экран). → `reg-02-identity-zoom.png`. `data-testid` `identity-photo-guide` → `photo-guide-zoom`.

Код (`feat(registration)` `ace66e4`, компонент `src/components/PhotoGuide.js`) — образцы подключены `require()` на всех шагах к реально существующим PNG в `src/assets/onboarding/verification/guides/`:

| Шаг | testID | образец |
|---|---|---|
| Личные данные (Identity) | `identity-photo-guide` | `personal_photo_guide.png` ✅ live |
| Селфи (Selfie) | `selfie-guide` | `personal_photo_guide.png` |
| Документы → права | `vd-license-guide` | `license_front_guide.png` |
| Документы → селфи с правами | `vd-license-selfie-guide` | `selfie_license_guide.png` |
| Фото авто → снаружи | `vp-exterior-guide` | `truck_exterior_guide.png` |
| Фото авто → салон | `vp-interior-guide` | `truck_interior_guide.png` |

Шаги Selfie / VehicleDocs / VehiclePhotos гейтятся загрузкой фото на сервер + валидным ИИН — пройти их в web под гостевым токеном хрупко; механизм PhotoGuide идентичен на всех шагах и доказан вживую на Identity, пути `require()` совпадают с физически присутствующими файлами. Считаю PASS.

### Пункт 2b — техпаспорт (СРТС): ⚪ N/A — пропущен по решению владельца

Шаги 1–3 исходной задачи (добавить `srts_guide.png` и `<PhotoGuide testID="vd-techpass-guide">` перед карточкой техпаспорта) **не выполнялись**:

- Файл, на который указывала задача (`~/Desktop/docs:design:onboarding-flow:/ChatGPT Image 13 июн. 2026 г., 14_14_09.png`), оказался **Welcome-сплэшем** (логотип UT, фура, «Welcome»), а **не образцом техпаспорта**.
- Настоящего образца СРТС на диске нет: 5 существующих guide-PNG сделаны из партии ChatGPT от 11 июня (личное фото/селфи-с-правами/права/кузов/салон); по диску `*техпаспорт*`/`*сртс*`/`*стс*` — пусто; в `README` `srts_good/bad.png` помечены «pending от дизайна».
- Сам автор коммита `ace66e4` уже зафиксировал: «Техпаспорт без образца — для него картинки-образца в репо нет, пропущен».

Копировать сплэш под именем `srts_guide.png` нельзя (водитель увидел бы экран приветствия на шаге «как фотографировать техпаспорт»). Владелец выбрал «**Пропустить шаги 1–3**». Код шагов 2–3 готов к выполнению, как только появится корректный файл.

## Пункт 3 — ТЕРМИНОЛОГИЯ: «предложение», цена — «Ставка» ✅ PASS

Живой прогон:
- На карточке/во вкладке — «**предложение**»: CTA `💬 1 предложение ›`, сегмент `Предложения (5)`.
- **Тост при отклонении: «❌ Предложение отклонено»** (клик «Отклонить»). → `04-reject-toast.png`.
- На экране одновременно присутствуют слово «предложен…» (термин заявки) и «**Ставка**» (цена сделки) — раздельно, как и задумано.

Код (`250bf96`, `src/utils/i18n.js`):
- `formatBids()` → «N предложений» (RU/KK/KG); тосты `bid_accepted_toast`/`accept_bid_success` = «Предложение принято», `bid_rejected_toast` = «Предложение отклонено», `bid_cancelled_toast` = «Предложение отменено», `bidSent` = «Предложение отправлено!»; метки `my_bids_tab`/`incoming_bids` = «Мои/Входящие предложения».
- Сохранена «**ставка**» как ЦЕНА фрахта: `chat_deal_card_price` = «Ставка», `edu8` = «Расчёт ставки на маршрут», `edit_locked_deal` = «…принятая ставка/сделка». ✅ корректно.

## Пункт 4 — СКОРОСТЬ бейджей ~12с ✅ PASS (код)

- `src/components/ui/v1/BottomNav.js`: `UNREAD_POLL_MS = 12000` (было 30000), `setInterval(fetchUnread, UNREAD_POLL_MS)`.
- `src/utils/useUnreadNotifications.js`: `POLL_MS = 12000` (было 30000).

Интервал поллинга не воспроизводится статичным скриншотом; подтверждено по коду (предыдущий `LIVE_RUN_2026-06-17` фиксировал 30с — теперь 12с). Активный чат поллит 3с, список чатов рефетчит на focus.

---

## Честная граница (НЕ тестировалось, без PASS)

**C1 — красный кружок на ИКОНКЕ домашнего экрана телефона + реальные APNS/FCM-пуши в фоне/killed — REAL DEVICE REQUIRED.** Нужен dev-client/TestFlight на телефоне владельца; на web/симуляторе недостоверно, не имитировал.

## Скриншоты (локально, gitignored)
`qa/screenshots/polish-run/`: `01-mytrips-searching.png`, `02-cargo-cta.png`, `03-offers-tab.png`, `04-reject-toast.png`, `reg-01-identity.png`, `reg-02-identity-zoom.png`.

## Итог
Пункты 1, 2, 3 — **PASS** (live + код), пункт 4 — **PASS (код)**. Техпаспорт (2b) — корректно пропущен (образца не существует). C1/реальные пуши — REAL DEVICE REQUIRED.

---

# Maestro: «образец-вперёд» (guide-first) в регистрации водителя — 2026-06-20

Отдельный нативный прогон правила: **на каждом шаге, где грузится фото, ОБРАЗЕЦ (✅/❌) виден ДО контрола загрузки, и по тапу открывается крупно**.

- **Среда:** Maestro 2.x · iPhone 17 (iOS 26.4) симулятор · Expo Go 2.32.18 (`appId host.exp.Exponent`) · Metro `:8081` (`EXPO_PUBLIC_API_URL=http://127.0.0.1:8001`) · backend `:8001` MOCK · логин serik через `_lib/qa-login.yaml` → `runScript ensure-actor.js` (`/qa/ensure-actor`).
- **Флоу:** `qa/maestro/registration-guides-first.yaml` (новый). Существующие `verification-render/-deep/-authenticated/-upload-flow.yaml` проверяют поля Identity / dashboard, но **ни один не покрывает guide-first** (testID образцов `*-guide` + `photo-guide-zoom`) — поэтому добавлен минимальный целевой флоу.
- **Доступ к шагам:** `/qa/ensure-actor` всегда выдаёт level 3 (approved) → `profile-pro-cta` уходит в `EditProfile`, а не в регистрацию. Чтобы CTA вёл в стек `Identity → Selfie → …`, serik засеян в **локальной QA-БД** на `verification_level=1` (сид состояния актёра, не подмена UI — экраны рендерятся реально). После прогона возвращён в level=3/approved.
- **Обход нативного пикера (DEV/QA-хук):** переходы между шагами идут через `qa-skip-step` — DEV-only кнопку (`src/components/dev/QaStepSkip.js`, строго `__DEV__`, в прод-бандл не попадает). Она навигирует на следующий экран регистрации в обход НАТИВНОГО iOS фото-пикера и серверных гейтов (`uploadSelfie → face_verified`, OCR техпаспорта/прав, ИИН-госреестр), которых нет в симуляторе. Сам `PhotoGuide` и экраны рендерятся **настоящие** — обходится только пикер/серверная проверка, не образец.
- **Связка для каждого образца:** `assertVisible <guide-testID>` → `tapOn <guide-testID>` → `assertVisible photo-guide-zoom` → `takeScreenshot` → `tapOn photo-guide-zoom` (закрыть). Где образец у низа списка — скролл к нижнему якорю `qa-skip-step`, чтобы образец встал над фиксированным футером и тап попал по нему.

## Таблица по 6 шагам — все LIVE PASS

| # | Шаг (экран) | guide testID | контрол загрузки (ниже образца) | Вердикт | Скриншот зума |
|---|---|---|---|---|---|
| 1 | Личное фото (IdentityStep) | `identity-photo-guide` | `identity-photo` | ✅ **LIVE PASS** | `step1-identity-photo-guide.png` |
| 2 | Селфи (SelfieStep) | `selfie-guide` | `selfie-slot` | ✅ **LIVE PASS** | `step2-selfie-guide.png` |
| 3 | Права лицевая (VehicleDocs) | `vd-license-guide` | DocCard «Водительское удостоверение» | ✅ **LIVE PASS** | `step3-vd-license-guide.png` |
| 4 | Селфи с правами (VehicleDocs) | `vd-license-selfie-guide` | DocCard «Селфи с правами в руках» | ✅ **LIVE PASS** | `step4-vd-license-selfie-guide.png` |
| 5 | Авто снаружи (VehiclePhotos) | `vp-exterior-guide` | DocCard «Фото кузова» | ✅ **LIVE PASS** | `step5-vp-exterior-guide.png` |
| 6 | Авто салон (VehiclePhotos) | `vp-interior-guide` | DocCard «Фото салона» | ✅ **LIVE PASS** | `step6-vp-interior-guide.png` |

Прогон зелёный целиком (0 FAILED): на КАЖДОМ из 6 шагов образец `*-guide` виден ДО контрола загрузки, тап открывает `photo-guide-zoom` (крупно), закрытие возвращает на шаг. Порядок «образец выше контрола» подтверждён и в коде (`<PhotoGuide>` в JSX выше слота съёмки/`DocCard` на каждом экране).

## Что добавлено для прохождения
- `src/components/dev/QaStepSkip.js` — DEV-only хук перехода (см. выше). `if (!__DEV__) return null` — в прод не течёт.
- Подключён в `IdentityStepScreen` (→ Selfie), `SelfieStepScreen` (→ VehicleDocs), `VehicleDocsScreen` (→ VehiclePhotos), `VehiclePhotosScreen` (→ TruckParams, как нижний scroll-anchor).
- Почему хук, а не «qa-fill-photo»/seed прогресса: navigation всегда стартует с Identity (нет resume-логики, seed не открывает VehicleDocs напрямую), а pure-fill-photo упирается в серверные гейты Selfie (`face_verified`) и VehicleDocs (OCR). Хук навигации монтирует РЕАЛЬНЫЕ экраны с РЕАЛЬНЫМИ образцами и надёжнее.

## Скриншоты Maestro (локально, gitignored)
`qa/screenshots/maestro-guides/`: `step1-identity-photo-guide.png` … `step6-vp-interior-guide.png` — зум каждого из 6 образцов (✅/❌) крупно.

## Граница честности
Бейдж на ИКОНКЕ телефона и реальные фоновые пуши Maestro не проверяет — **REAL DEVICE REQUIRED**.
