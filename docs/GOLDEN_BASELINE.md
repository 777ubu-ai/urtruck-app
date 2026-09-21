# UrTruck — GOLDEN BASELINE

> **Центральный реестр доказанно рабочего состояния UrTruck.**
>
> Этот файл хранит не ожидания, не обещания и не пересказ чата, а точки восстановления:
> exact SHA, QA-сборку, устройство, сценарий, результат и ограничения.
>
> **Главное правило:** работающий блок нельзя заменять новой реализацией без
> сравнения с его known-good состоянием и функционального/визуального регресса.

## 1. Два допустимых значения «10/10»

В проекте используются только две формулировки:

### 10/10 блока

Разрешено только когда для конкретного блока есть:

- known-good SHA / QA build;
- конкретный сценарий;
- PASS-доказательство;
- устройство/платформа, если функция device-dependent;
- ограничения и незакрытые соседние дефекты явно отделены.

Пример: «RU→ZH voice 60 s — 10/10 блока на двух Xiaomi по evidence QA062».

### 10/10 продукта

Разрешено только когда **один и тот же release candidate** одновременно прошёл
все обязательные gates проекта: Android, iPhone, web/production, critical deal
path, chat, voice/translation, push, GPS, map, documents, security, localization,
bad network/idempotency и release acceptance.

Исторический PASS отдельного блока нельзя переносить на новый SHA без ретеста
затронутой функции.

## 2. Текущий repository baseline

- **Baseline type:** repository + CI baseline
- **Main SHA:** `1da2afa730ca1755b27877a5967a5d6c645fc45b` (current main at governance start)
- **Main commit:** Merge PR #379 — Android mediaPlayback FGS removal
- **Verified PR head:** `2eea415b9a3609fe357d90e60a4e50f76e4cd550`
- **Дата фиксации:** 2026-09-21
- **Полный release 10/10:** **НЕ ЗАЯВЛЕН**

Причина: для текущего main есть сильное CI evidence, но нет единого набора
physical Android+iPhone+production evidence на одном SHA по всем обязательным
device-dependent функциям.

## 3. CI evidence для текущего repository baseline

PR head `2eea415b9a3609fe357d90e60a4e50f76e4cd550`:

| Workflow / job | Run ID | Result |
|---|---:|---|
| UrTruck QA Center | 35590903659 | PASS |
| Maestro flow contract | 35590903659 | PASS |
| QA Center quick gate | 35590903659 | PASS |
| Routing provider forensic | 35590903659 | PASS |
| UrTruck Full QA Audit | 35590903556 | PASS |
| API and backend regression | 35590903556 | PASS |
| Design, FSM and UX gate | 35590903556 | PASS |
| Playwright desktop visual audit | 35590903556 | PASS |
| Playwright mobile visual audit | 35590903556 | PASS |
| Maestro mobile scenarios and release contract | 35590903556 | PASS |
| PR Quality Gate | 35590903749 | PASS |
| quality-gate / Backend tests | 35590903749 | PASS |
| quality-gate / Frontend tests, lint, and build | 35590903749 | PASS |
| quality-gate / Mandatory web E2E subset | 35590903749 | PASS |

Этот CI baseline защищает repository state, но не заменяет physical acceptance.

## 4. Подтверждённые GOLDEN-блоки — physical/history evidence

Ниже хранятся **точки восстановления отдельных функций**. Они не означают
готовность общего релиза.

### 4.1. Chat text — два Xiaomi

**Статус блока:** GOLDEN / PASS.

Подтверждено:

- RU ↔ ZH сообщения физически доходили в обе стороны;
- background/foreground delivery подтверждалась;
- на QA061/QA062 физический Send → видимый текст у получателя:
  - не позднее 6.821 s;
  - затем не позднее 6.795 s;
- после stop/relaunch история и новое сообщение сделки снова загружались;
- backend оставался источником истины, а не память процесса приложения.

Recovery/evidence:

- branch: `qa/master-hard-qa-20260916`;
- evidence doc: `docs/qa/qa062-chat-attachments-20260917.md`;
- evidence/history commit reference: `b67d5a87`;
- QA062 Android package: `com.urtruck.app.qa2`;
- version: `1.0.8 / 211040062`;
- devices: два Xiaomi.

Дополнительный более поздний физический PASS QA073:
на общей сделке `41a7b7c2-523c-4f41-92aa-b235e84a1da0` доставлено
5 сообщений в каждую сторону, включая background/foreground и OFF→ON сети.

### 4.2. Voice / STT / Translation RU→ZH и ZH→RU — 60 s

**Статус core voice/STT/translation блока:** GOLDEN / PASS на QA062.  
**Статус player progress UI:** RETEST REQUIRED.

Repository evidence QA062 прямо подтверждает:

- Shipper RU voice физически записан, автостоп на 1:00, доставлен Driver;
- OpenAI STT: source=ru, transcript сохранён;
- RU→ZH показан физически на ZH-телефоне за ≤13.61 s;
- повтор: cached=true / translation_cached=true, 0.140 / 0.044 s;
- Driver ZH → Shipper RU также записан и доставлен как 1:00;
- ZH→RU показан физически за ≤14.48 s;
- повтор: cached=true / translation_cached=true, 0.316 / 0.045 s;
- дополнительно provider=openai проверены ZH→EN и EN→RU;
- media evidence подтвердило непрерывное 60 s воспроизведение ZH voice.

Known limitation того же QA:

- UI таймер/полоса плеера после первого тика могли оставаться на 0:59;
- root cause: progress callback подключался после запуска native playback;
- кодовый fix был добавлен, но требовал следующего APK для физического retest;
- STT нельзя считать юридически точным вводом критичных буквенно-цифровых кодов.

Recovery/evidence:

- branch: `qa/master-hard-qa-20260916`;
- evidence doc: `docs/qa/qa062-chat-attachments-20260917.md`;
- QA062 candidate source: `584557fd94ce7ba5db5fa780f9c37da95ca1719a`;
- related history/report references: `bc8c5a7b`, `b67d5a87`;
- earlier physical stored voice RU→ZH evidence:
  `docs/qa/chat-history-recovery-20260917.md`, fix `67200908`,
  evidence/report reference `6a0fdca3`.

### 4.3. Attachments — PDF / photo / CSV path

**Статус подтверждённой части:** GOLDEN / PASS.

Подтверждено QA061/QA062:

- PDF выбран системным picker, появился у второго участника;
- PDF скачан и открыт Android viewer;
- SHA-256 скачанного PDF совпал с исходником;
- CSV появился у второй стороны;
- photo picker Shipper→Driver и Driver→Shipper физически работал;
- фото доставлялись и открывались;
- offline история сохранялась;
- retry после восстановления сети завершался без duplicate client message ID;
- private filename/download behavior проверялось.

Ограничения:

- встроенный PDF preview этим evidence не доказывается;
- XLS/XLSX физически в этом delta не закрыты;
- большой набор крупных файлов требует отдельного acceptance.

Recovery/evidence:
`docs/qa/qa062-chat-attachments-20260917.md`,
`584557fd`, `765fbe8d`, `bc8c5a7b`, `b67d5a87`.

### 4.4. Native Android push / deeplink

**Статус подтверждённой части:** GOLDEN / PASS на соответствующих QA build.

Подтверждено:

- attachment push для CSV/PDF: HIGH;
- sound URI, vibration и Android audible timestamp;
- tap открывал нужную сделку;
- RU/ZH photo push локализован;
- counteroffer push ZH локализован;
- QA072: background notification, sound/vibration, channel, badge и deeplink
  в сделку проверялись на реальном Android.

Ограничения:

- полный matrix всех event types на одном release SHA не зафиксирован;
- слуховое подтверждение владельцем для отдельных QA062 уведомлений оставалось OPEN;
- OPPO matrix не закрыта;
- QA2 package требует корректный Firebase config.

Historical implementation references:

- `3baf5257`, `6c7eecf4`, `298ae68f` — native push by default /
  registration / Deals deeplink;
- `b88b5f54`, `cbaf7fff` — transactional critical push;
- `6efec662`, `b5159b0d` — единый Android FCM handler;
- `5621a714`, `f5df708e`, `ddbcf485`, merge `1436a7f1` —
  reconciliation/partial/dead-letter.

### 4.5. GPS QA072

**Статус блока на QA072:** GOLDEN / PASS для зафиксированного Android сценария.

Физически подтверждено:

- 30+ минут;
- работа в фоне;
- OFF→ON сети;
- процесс и foreground GPS notification сохранились;
- у второго участника была свежая точка.

Это historical block PASS. Его нельзя автоматически переносить на QA073 или
новый release SHA.

До product 10/10 всё равно нужен release-specific Android+iPhone GPS gate,
включая terminal stop и требуемую матрицу degraded/recovery.

### 4.6. Native in-app map

**Статус подтверждённой части:** GOLDEN / PASS.

QA059 repository evidence:

- Xiaomi shipper;
- native Yandex tiles внутри UrTruck;
- Иу→Москва:
  - 9 063 км;
  - 4 дн 20 ч движения;
  - 12 дн 8 ч с отдыхом;
- без внешнего навигатора;
- без `provider_not_configured`.

Exact QA059 candidate:

- source SHA: `12d7d6792abf62efcbf47093797d86efba0c9a1c`;
- package: `com.urtruck.app.qa2`;
- versionCode: `211040059`;
- evidence doc: `docs/qa/map-profile-recovery-20260917.md`;
- report/history reference: `c141aea2`.

QA072 отдельно подтверждал Android native
`truck-map-yandex-mapkit`.

Map keys остаются secret/config contract, не source-code data.

### 4.7. Counteroffer / two-driver concurrency

**Статус:** GOLDEN / PASS на QA062 / предыдущем QA.

Физически подтверждено:

- одновременно две ставки;
- shipper выставил встречную цену;
- выбранный Driver принял именно встречную цену;
- server truth:
  - cargo=taken;
  - победитель accepted;
  - amount сохранён;
  - проигравший rejected;
  - ровно одна сделка;
- новая ставка проигравшего после выбора победителя → HTTP 409;
- недоступное действие проигравшему скрывается/блокируется.

Evidence:
`docs/qa/qa062-chat-attachments-20260917.md`.

### 4.8. Back / MyTrips

Подтверждённые отдельные physical results:

- рабочий Back в сделке;
- QA059 — закреплённый Back профиля;
- MyTrips — 10 циклов переходов на Xiaomi-перевозчике без зависания;
- QA073 report — Back в сделке подтверждён.

Статус: block PASS для проверенных экранов, но это не blanket PASS всей
навигации.

## 5. Автоматические контрольные точки 14–21 сентября

Эти результаты подтверждают качество соответствующих исходниковых срезов.
Они **не переносят PASS автоматически** на более позднюю сборку.

| Срез | Backend | Frontend | Дополнительно |
|---|---:|---:|---|
| 16.09 | 838/838 | 663/663 | i18n 2003 × 4 языка |
| 17.09 route-fix | 858/858 | 685/685 | RU/EN/KK/ZH 2003, missing=0 |
| 17.09 history recovery | 864/864 | 691/691 | i18n 2006 × 4, missing=0 |
| QA062 | 878/878 | 699/699+ | lint PASS; final report also records frontend 700/700 after voice progress regression |

Для QA062 repository evidence authoritative details:
`docs/qa/qa062-chat-attachments-20260917.md`.

## 6. GOLDEN DESIGN BASELINE — marketplace route cards

### 6.1. Recovery commits

Главные design recovery points:

- `bb1d57b9` — уплотнить карточки маршрутов и грузов;
- `a443d2aa` — уплотнить карточки для полного экрана;
- `e423bd40` — canonical round country flags.

Для route/card regression сначала сравнивать код с этими точками.

### 6.2. Immutable compact-card contract

Зафиксировано в `a443d2aa`,
`src/components/ui/v1/MarketplaceCard.js`,
`src/components/ui/v1/RouteLine.js` и
`tests/frontend/design_marketplace_card.test.mjs`.

| Element | Golden contract |
|---|---|
| Card minHeight | 84 dp; тест использует compact target 82–88 |
| Padding | horizontal 12 dp / vertical 7 dp |
| Radius | 18 dp |
| Route | одна горизонтальная строка: flag + city → flag + city |
| City typography | 15 sp / line-height 19 / bold / one line |
| Route flags | round 26×26 dp |
| Price rail | fixed 108 dp справа |
| Price | right aligned, tabular numbers |
| Price meta | 11/13 |
| Bookmark | 34×34 dp |
| Inter-card spacing | 7 dp |

Главный UX смысл: маршрут читается одним взглядом при быстром скролле, а
фиксированная price rail не вытесняет город на вторую строку.

### 6.3. CountryFlag immutable rule

Canonical implementation:

- только shared `CountryFlag`;
- bundled `country-flag-icons` SVG;
- round crop;
- border 1.5 dp в golden implementation;
- одинаковый принцип Android/iOS/web;
- rectangular flags запрещены;
- emoji flags запрещены.

Reference:
`e423bd40`,
`docs/design/country-flags.md`.

## 7. Подтверждённая design regression QA073

### Candidate identification

- branch: `fix/ios-chat-nav-voice-route-20260921`;
- SHA: `5f996baef5165268c72f67bea70a7f3acb57bd3e`;
- package: `com.urtruck.app.qa2`;
- versionName: `1.0.9`;
- versionCode: `211040073`;
- installed: Xiaomi shipper, Xiaomi driver, OPPO.

### Route-card defect

**Status: P1 FAIL / NOT A BASELINE.**

Observed:

- `Алматы` обрезается до `Ал…`;
- flags/cities visually разъезжаются;
- обычный маршрут стал двухстрочным;
- карточка визуально выше/хуже сканируется.

Confirmed code cause:

- golden `a443d2aa` RouteLine:
  one row, `flexDirection: 'row'`, two flags/cities in one horizontal line;
- QA073 `5f996bae` RouteLine:
  ordinary route rendered as two `pointRow` blocks;
- Dulaty–Kalzhat added a nested two-level hierarchy in the same compact area.

**Recovery rule:** route-card fix starts from comparison
`a443d2aa..5f996bae`, not from a new design.

## 8. Другие текущие QA073 regressions / blockers

Эти пункты запрещают product 10/10 и release.

| Block | Current QA073 result |
|---|---|
| Route cards | P1 FAIL |
| Create QA cargo / pickup date | P1 FAIL — calendar does not open; publish blocked by «Укажите дату загрузки» |
| Route in details | FAIL — «Расчёт маршрута временно недоступен» |
| Translation | FAIL — physical «привет» on ZH locale → `翻译不可用` |
| OPPO full third-account scenario | BLOCKED — test account not ready; Google sign-in cancelled |
| iPhone physical visual QA | BLOCKED / unavailable at that test point |

External provider/config blockers must remain explicit:

- translation provider previously returned HTTP 429
  `insufficient_quota / credit_balance_exhausted`;
- QA2 push requires correct Firebase config for the QA2 package;
- native map requires protected MapKit configuration/secrets.

UI workaround must not hide an external/provider/config failure.

## 9. Historical implementation / restoration registry

| Date | SHA/reference | Confirmed work |
|---|---|---|
| 14.09 | `e423bd40`, `fa95118f`, `f743aa08`, merge `ef0af90f` | canonical round flags + visual contract/tests |
| 14–15.09 | `bb1d57b9`, `a443d2aa` | compact route/cargo cards |
| 14.09 | `279b0bd8`…`9d2915e7` | chat incoming anchoring/autoscroll fixes |
| 15–16.09 | `f7e5d901`, `4e14b61a`, `41d2569f` | one-tap voice translation / recovery after chat open |
| 15–16.09 | `3baf5257`, `6c7eecf4`, `298ae68f` | native push default / independent registration / Deals deeplink |
| 16–17.09 | `b88b5f54`, `cbaf7fff` | transactional critical push for accepted counteroffer |
| 17.09 | `12d7d679`, QA059 | long road route + physical in-app Yiwu→Moscow map |
| 17.09 | `67200908`, `6a0fdca3` | chat history signing-timeout recovery + physical RU→ZH voice evidence |
| 17.09 | `584557fd`, `bc8c5a7b`, `b67d5a87` | chat speed, media/documents, retry, localized push, QA061/062 |
| 18.09 | `6efec662`, `b5159b0d` | single Android FCM handler through prebuild |
| 19.09 | `5621a714`, `f5df708e`, `ddbcf485`, merge `1436a7f1` | push history reconciliation / partial vs dead-letter |

Эта таблица — **recovery map**, а не разрешение cherry-pick без анализа
совместимости с current main.

## 10. Known bad candidate rule

QA073 `5f996baef5165268c72f67bea70a7f3acb57bd3e` — не Golden Baseline.

Его можно использовать как diagnostic point для reproducing regression, но:

- нельзя объявлять release-ready;
- нельзя переносить его visual RouteLine как новый канон;
- нельзя использовать FAIL translation/date/route как «ожидаемое поведение»;
- нельзя заменять historical working implementation без сравнения.

## 11. Pre-change recovery lookup

Перед изменением критического блока исполнитель обязан заполнить:

```text
Capability:
Current SHA:
Known-good SHA:
Known-good QA build:
Evidence doc:
Physical devices:
What behavior must survive:
Known current regression:
Diff range inspected:
Regression tests:
Physical retest plan:
```

Если known-good не найден — сначала history/branches/docs, потом код.

## 12. Release-specific certification table

Заполняется заново для **одного exact release SHA**.

| Gate | Result | Evidence |
|---|---|---|
| Backend/API regression | PENDING | exact release run required |
| Frontend lint/unit/build | PENDING | exact release run required |
| Mandatory E2E | PENDING | exact release run required |
| Android physical | PENDING | exact build/device |
| iPhone physical | PENDING | exact build/device |
| Critical deal path | PENDING | shipper↔driver end-to-end |
| Chat text | PENDING | cross-device |
| Voice 55–60 s RU→ZH | PENDING | exact release |
| Voice 55–60 s ZH→RU | PENDING | exact release |
| STT/translation cache/persistence | PENDING | exact release |
| Attachments | PENDING | exact release |
| Push foreground/background/killed | PENDING | exact release |
| GPS 15/30 min + recovery/terminal | PENDING | exact release |
| Native map / route | PENDING | exact release |
| Security / unauthorized access | PENDING | exact release |
| RU/ZH/EN (+KK where supported) | PENDING | exact release |
| Bad network / duplicate protection | PENDING | exact release |
| Load test | PENDING | defined release profile |
| Production smoke | PENDING | production SHA/version |
| Controlled shipment | PENDING | end-to-end evidence |

**Product 10/10 разрешён только когда все обязательные строки для конкретного
release имеют PASS и проверяемое evidence.**

## 13. Stop-the-line conditions

Любой из пунктов ниже останавливает зависимый release-flow:

- P0/P1 regression;
- login failure;
- cargo/trip cannot be created/published;
- deal cannot finish;
- chat unavailable;
- critical push failure;
- GPS/map failure in active trip;
- document access/security regression;
- translation provider failure when feature is claimed available;
- iPhone gate not completed for production release.

После P1:

1. зафиксировать bad SHA;
2. найти last known-good;
3. установить root cause;
4. отдельный patch;
5. regression test;
6. exact physical retest;
7. только затем продолжить dependent QA.

## 14. Baseline update rules

Golden Baseline меняется отдельным осознанным PR/commit.

Запрещено:

- писать «последняя версия» вместо SHA;
- переносить PASS со старого SHA на новый без scope analysis;
- считать open PR частью main;
- считать web/emulator доказательством native push/GPS/voice;
- удалять known risk ради красивого отчёта;
- объявлять product 10/10 при PENDING/FAIL/BLOCKED;
- переписывать Golden block «потому что проще сделать заново».

## 15. Current decision

На 21.09.2026:

- **общий UrTruck product 10/10: НЕ ПОДТВЕРЖДЁН**;
- historical Golden blocks выше должны сохраняться и использоваться как
  recovery points;
- QA073 содержит P1/FAIL/BLOCKED и не является release baseline;
- design recovery point для карточек:
  `a443d2aa` + `bb1d57b9`;
- country flag recovery point:
  `e423bd40`;
- следующий release candidate обязан доказать отсутствие регрессии на одном SHA.
