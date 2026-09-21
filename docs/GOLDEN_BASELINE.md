# UrTruck — GOLDEN BASELINE

> **Центральный реестр доказанно рабочего состояния.**
> Это не список пожеланий и не память из чата. Запись принимается только с
> проверяемым evidence: SHA, CI run, device или production proof.

## 1. Текущий repository baseline

- **Baseline type:** repository + CI baseline
- **Main SHA:** `1da2afa730ca1755b27877a5967a5d6c645fc45b`
- **Main commit:** Merge PR #379 — Android mediaPlayback FGS removal
- **Verified PR head:** `2eea415b9a3609fe357d90e60a4e50f76e4cd550`
- **Дата фиксации:** 2026-09-21
- **Полный release 10/10:** **НЕ ЗАЯВЛЕН**

Причина: CI доказан, но этот документ ещё не содержит полного нового набора
physical Android+iPhone+production evidence для всех device-dependent функций.

## 2. CI evidence для текущего baseline

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

## 3. Protected capability ledger

Статусы:

- **GOLDEN** — exact SHA + automated + required physical/production evidence.
- **CI-PROTECTED** — automated evidence есть, physical evidence ещё не записан.
- **CANDIDATE** — работа есть в PR/ветке, но не является main baseline.
- **BLOCKED/UNKNOWN** — нельзя использовать как known-good.

| Capability | Baseline state | Evidence / next proof |
|---|---|---|
| Auth / onboarding | CI-PROTECTED | Current required CI; physical Android/iPhone login must be attached before GOLDEN |
| Cargo/Trip/Offer | CI-PROTECTED | Backend + web E2E; physical role-to-role flow required |
| Deal FSM | CI-PROTECTED | Design/FSM gate + mandatory E2E; full device deal required |
| Chat text | CI-PROTECTED | Automated regression; cross-device physical proof required |
| Voice 55–60 sec | UNKNOWN | Must record Android/iPhone device proof on exact SHA |
| STT / translation | UNKNOWN | Must record RU↔ZH/EN proof and restart persistence on exact SHA |
| Push / Bell / deeplink | CI-PROTECTED | Push critical subset exists; killed/background physical delivery required |
| GPS background | CI-PROTECTED | Contract tests exist; 15/30 min physical run required |
| Map / routing | CI-PROTECTED | Routing + web checks; native MapKit proof required |
| Border / CGR | CI-PROTECTED | PR #375 integrated before current main; physical role flow required |
| Documents | CI-PROTECTED | Existing suite; physical upload/view/access proof required |
| Native attachments changes from PR #378 | CANDIDATE | PR #378 is open; NOT part of this main baseline |
| Security / unauthorized access | CI-PROTECTED | Security regression; targeted production/real-user proof as required |
| RU/ZH/EN/KK localization | CI-PROTECTED | QA Center/i18n contracts; physical critical-screen spot check required |

## 4. Historical known-good references

Эта секция хранит только полезные точки восстановления, а не автоматически
актуальный код.

- PR #375 / merge SHA `72e4e3c1b758f96a7512a2aacc1deedd22353024`:
  role-aware CGR/Border integration; его изменения входят в текущий main.
- PR #379 / merge SHA `1da2afa730ca1755b27877a5967a5d6c645fc45b`:
  текущая repository baseline point.

При регрессии сначала делать `git diff`/history comparison с этими точками,
а не переписывать функцию.

## 5. Как функция получает статус GOLDEN

Для каждой capability добавить запись:

```text
Capability:
Exact SHA:
Build/version:
Automated tests:
CI run IDs:
Device(s):
OS/version:
Accounts/roles:
Scenario:
Result:
Production URL/version:
Screenshot/video/artifact:
Known risks:
Verified by:
Verified at:
```

Если обязательное поле неизвестно — статус не GOLDEN.

## 6. Обновление baseline

Baseline меняется отдельным осознанным commit/PR после доказанной проверки.

Запрещено:

- заменять SHA словами «последняя версия»;
- переносить PASS со старого SHA на новый без анализа затронутого scope;
- считать open PR частью main;
- считать emulator/web доказательством native push/GPS/voice;
- удалять known risk ради красивого отчёта;
- писать «10/10» при PENDING/UNKNOWN.

## 7. Recovery rule

При regression:

1. определить current bad SHA;
2. определить last known-good SHA для capability;
3. сравнить diff;
4. найти first bad commit;
5. восстановить минимально;
6. добавить regression test;
7. повторить exact affected gate + critical path;
8. только затем обновить этот файл.

## 8. Release certification table

Заполняется для конкретного release SHA, не «вообще для проекта».

| Gate | Result | Evidence |
|---|---|---|
| Backend/API regression | PENDING | exact release run required |
| Frontend lint/unit/build | PENDING | exact release run required |
| Mandatory E2E | PENDING | exact release run required |
| Android physical | PENDING | device/build required |
| iPhone physical | PENDING | device/build required |
| Chat/voice/translation | PENDING | cross-device proof required |
| Push killed/background | PENDING | device proof required |
| GPS 15/30 min | PENDING | device proof required |
| Native map | PENDING | device proof required |
| Documents | PENDING | device proof required |
| Security/IDOR/RLS | PENDING | exact release proof required |
| Production smoke | PENDING | production SHA/version required |
| Controlled shipment | PENDING | end-to-end evidence required |

**Release 10/10 разрешён только когда обязательные строки для данного release
имеют PASS и доказательство.**
