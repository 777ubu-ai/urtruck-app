# UrTruck — Golden Baseline

Дата фиксации: 21.09.2026.
Назначение: реестр подтверждённых блоков и запрет переноса исторического PASS
на новый кандидат без повторного теста.

## Правило статусов

- PASS — есть конкретный SHA/build/device/evidence.
- PARTIAL — доказана часть матрицы.
- BLOCKED — проверить невозможно из-за внешнего или платформенного блокера.
- FAIL — сценарий воспроизведён и не соответствует acceptance.
- UNKNOWN — подтверждённых данных недостаточно.

Общий Release 10/10: **BLOCKED**. Отдельные блоки ниже имеют физический PASS.

## Текущая интеграционная точка

- Branch: `integration/urtruck-golden-candidate-20260921`
- Starting HEAD: `5f996baef5165268c72f67bea70a7f3acb57bd3e`
- Merge-base with origin/main: `9b40722c44d8ff6ac3ad0c38a58224383f4bef0c`
- origin/main observed: `72e4e3c1b758f96a7512a2aacc1deedd22353024`
- Confirmed deployed production SHA: **UNKNOWN**
- Installed Android QA: 1.0.9 / 211040073 / `com.urtruck.app.qa2`
- APK SHA-256: `e99fc1d1b9432096a24cb5340a768906cb87a6033a90b2c7f7368795b5011163`
## Known-good registry

| Функция | Статус | Known-good evidence | Платформа / дата |
| --- | --- | --- | --- |
| Compact cards | PASS historical; FAIL QA073 | `a443d2aa`, tests enforce 84 dp | Android UI, 15.09 |
| Round flags | PASS historical | `e423bd40`, `docs/design/country-flags.md` | shared UI, 14.09 |
| Native map route | PASS historical | `12d7d679`, QA059: Yiwu→Moscow 9063 km | Xiaomi, 17.09 |
| Text chat | PASS historical + QA073 delivery | QA061/062 ≤6.821/6.795 s; QA073 5×2 | two Xiaomi |
| RU→ZH voice translation | PASS partial historical | `6a0fdca3`, `b67d5a87`; 4 s and new 27 s voice | Xiaomi, 17.09 |
| ZH→RU voice 55–60 s | BLOCKED/OPEN | no complete physical evidence | — |
| Documents/photos | PASS partial historical | `b67d5a87`; PDF/CSV/photo delivery and retry | Xiaomi QA061/062 |
| Android native push | PASS partial historical | HIGH, sound/vibration, localized RU/ZH, deeplink | Xiaomi QA061/062/072 |
| OPPO push sound | OPEN | no owner-audible acceptance | OPPO |
| GPS 30 min | PASS on QA072 | background + network OFF→ON + fresh counterparty point | Xiaomi |
| iPhone full visual QA | BLOCKED | physical device currently unavailable | iOS |
| Deal concurrency | PASS historical; retest required | one winner, loser CTA hidden | Android |
| Unauthorized third party | PARTIAL; retest required | contracts exist, OPPO matrix incomplete | Android |
## Approved design contract

Marketplace card:
- minHeight 84 dp;
- padding horizontal 12 dp, vertical 7 dp;
- border radius 18 dp;
- gap between cards 7 dp;
- bookmark 34×34 dp;
- fixed price rail 108 dp.

Route:
- ordinary route is one horizontal row;
- round flags 26×26 dp;
- city typography 15/19 bold;
- price stays right and must not truncate the destination;
- border pair may use a compact two-level origin/checkpoint hierarchy without
  increasing the card or breaking destination readability.

CountryFlag is the only canonical renderer. Bundled SVG, round crop, 1.5 dp
light border; rectangular and emoji flags are forbidden.

## Current QA073 regressions

| Defect | Status | Evidence |
| --- | --- | --- |
| Ordinary route became two rows; Almaty shown as `Ал…` | P1 FAIL | physical screenshot + diff after `a443d2aa` |
| Cargo loading date picker does not open | P1 FAIL | publish blocked by «Укажите дату загрузки» |
| Translation button shows `翻译不可用` | FAIL | real RU message on ZH Xiaomi |
| Route calculation temporarily unavailable | FAIL/needs root cause | physical QA073 |
| OPPO third account | BLOCKED | Google login cancelled |
## Historical automatic checkpoints

- 16.09: backend 838/838; frontend 663/663; i18n 2003×4, missing 0.
- 17.09 route-fix: backend 858/858; frontend 685/685.
- 17.09 chat-history fix: backend 864/864; frontend 691/691; i18n 2006×4.
- QA062: backend 878/878; frontend 699/699; lint PASS.

These results apply only to their exact source/runtime snapshots.

## Protected modules

No rewrite without owner-approved architecture decision:
Deal FSM, Chat, Voice/STT/Translation, Documents, Push, GPS, Maps, Auth,
Payments, Notifications, RLS/database access and navigation.

## Evidence documents

- `docs/qa/map-profile-recovery-20260917.md`
- `docs/qa/chat-history-recovery-20260917.md`
- `docs/qa/qa062-chat-attachments-20260917.md`
- `docs/qa/release-remediation-report-20260916.md`
- `docs/design/country-flags.md`

## Promotion rule

A block is promoted for the new candidate only after its automatic tests and
required physical matrix pass on the same final SHA. No historical PASS is
silently inherited.
