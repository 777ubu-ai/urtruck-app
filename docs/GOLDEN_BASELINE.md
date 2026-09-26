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
| Compact cards/routes | PASS source candidate; physical retest required | `2e9abdef`, tests enforce 84 dp and one-line ordinary route | Android pending |
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
| Ordinary route became two rows; Almaty shown as `Ал…` | FIXED IN SOURCE; RETEST | `2e9abdef`, route regression tests PASS |
| Cargo loading date picker does not open | FIXED IN SOURCE; RETEST | `2e9abdef`, explicit open action + regression test |
| Translation button shows `翻译不可用` | FAIL | real RU message on ZH Xiaomi |
| Route calculation temporarily unavailable | FAIL/needs root cause | physical QA073 |
| OPPO third account | BLOCKED | Google login cancelled |
## Historical automatic checkpoints

- 16.09: backend 838/838; frontend 663/663; i18n 2003×4, missing 0.
- 17.09 route-fix: backend 858/858; frontend 685/685.
- 17.09 chat-history fix: backend 864/864; frontend 691/691; i18n 2006×4.
- QA062: backend 878/878; frontend 699/699; lint PASS.
- Golden source candidate `2e9abdef`: frontend 779/779; backend 901/901;
  lint, QA Center quick, dependency audit and Python dependency check PASS.

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

## QA2 snapshot — 26.09.2026

Эта запись не переносит исторические PASS и не меняет общий статус: **BLOCKED**.

- Рабочая ветка: `fix/voice-stt-translation-20260925`.
- Исходный SHA текущей проверки: `ea3c8c4ca875e84f8185940a774f04dc4f815a2b`.
- QA2 Web подтверждён на том же SHA по предоставленной release-сверке.
- QA2 API отвечает `/api/version`: `1.0.50`, build time `2026-09-26 14:22`.
- `urtruck-qa2.service` и приватный `urtruck-qa2-ai.service` наблюдались как
  active; локальный AI слушает только loopback `127.0.0.1:8003`.
- Локальный AI health подтвердил `private=true`, speech/translation models и
  языки `en/kk/ru/zh`; серверная synthetic translation matrix — `54/54`.
- Фактическая конфигурация QA2 на момент сверки: оба провайдера `local_ai`,
  `LOCAL_AI_URL=http://127.0.0.1:8003`; наличие ключа OpenAI не означает его
  выбор и не является доказательством работоспособности внешнего провайдера.
- Реальная запись `message_id=76`: `.m4a`, заявленная длительность 29 секунд,
  sender language `ru`, provider `local_faster_whisper_large_v3_turbo`; STT
  сохранил посторонний русский текст вместо контрольной фразы. Перевод в `zh`
  был отклонён локальным quality gate (`translation confidence too low`).
- Телефонная голосовая приёмка не PASS: контрольный аудиозахват не доказал, что
  контрольная фраза попала в микрофон Xiaomi; новая матрица шести направлений
  требует повторной записи через UI и остаётся BLOCKED до воспроизводимого
  источника аудио и доказательств на Xiaomi/OPPO.
- Маршрут QA2 остаётся BLOCKED: runtime сообщает `routing.provider=none`;
  серый пунктир интерфейса не считается дорожным маршрутом.
