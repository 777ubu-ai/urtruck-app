# Финальный статус — всё, что я сделал в рамках договора

Дата фиксации: 2026-05-10. Все ограничения договора **соблюдены**:

- ❌ PR #15 не мержил
- ❌ `app.json` / `eas.json` не правил
- ❌ TestFlight / Push / version 1.0.0 не трогал
- ❌ iOS native (`UrTruck/`, `ios/`, `*.xcodeproj`) не трогал
- ❌ preview-stage50 не трогал
- ❌ `release/appstore-rc1` / `main` не двигал

---

## Что лежит на сервере

### 1. Ветка `claude/qa-testing-urtruck-EiRlA` (5 коммитов фикса + 3 коммита документации)

```
df9ba96  docs: гайд по 3 блокерам ASC submission
5fca2e6  docs: comparison report PR #15 vs QA-ветка
6f3ac37  i18n: полная локализация HowItWorks + route fallback (RU/KK/ZH/EN)
865d93d  fix: частичные баги из QA-отчёта (#1, #5, #6, #8, #10)
47d6fb5  fix: новые баги из QA-отчёта (N1, N2)
f93aec0  fix: устранены P0 блокеры из QA-отчёта (#4, #7, #9, #11)
6142069  docs: добавлен QA-отчёт по 12 известным багам + 3 новым
```

В QA-ветке закрыты все 12 + 3 бага. Build зелёный. **Целиком не мержить** — по плану из comparison report.

Файлы документации в этой ветке:
- `QA_REPORT.md` — разбор всех 12 + 3 багов
- `PR15_VS_QA_COMPARISON.md` — какие фиксы пересекаются с PR #15, какие брать
- `ASC_SUBMISSION_GUIDE.md` — гайд по 3 блокерам App Store submission
- `FINAL_STATUS.md` — этот файл

### 2. Ветка `cherry-qa-after-pr15` (1 коммит, готов к PR)

```
fb5b4dc  fix: cherry-pick из QA-ветки — Support chat (Bug #7) + city nullish (N2)
```

Содержит ровно **3 файла**:
- `src/screens/HowItWorksScreen.js` — Support chat кликабельный
- `src/screens/ProfileScreen.js` — N2 (`city ?? → ||`)
- `src/utils/i18n.js` — +148 строк новых ключей × 4 языка

Base: `release/appstore-rc1`. Diff: +217/-59. Build зелёный.

⚠ **PR не открыт.** Откроешь сам после merge PR #15. Если открыть до — локализационные ключи окажутся в bundle'е раньше, чем код, который их использует (не сломает, но грязно).

---

## Что осталось сделать **тебе** (по приоритету)

### A. Сейчас — owner smoke по preview-stage50

URL: https://urtruck.kz/preview-stage50/
Чек-лист: [см. предыдущее моё сообщение в чате] (8 секций A–H, копируется в телефон).

**Если smoke OK** → дальше B.
**Если есть баги** → пришли список с указанием буквы (A–H), я правлю PR #15 и обновлю preview-stage50.

### B. После owner OK — merge PR #15

```
PR #15: https://github.com/777ubu-ai/urtruck-app/pull/15
       stage50-real-android-smoke-p0-fixes → release/appstore-rc1
```

После merge:
- `release/appstore-rc1` → `main`
- CI deploy
- health-check
- tag `stable-real-android-smoke-v98`

Если хочешь — могу сделать merge через MCP по твоей команде.

### C. После merge PR #15 — открыть PR из `cherry-qa-after-pr15`

```
https://github.com/777ubu-ai/urtruck-app/pull/new/cherry-qa-after-pr15
```

Title (предлагаю): `fix: cherry-pick из QA — Support chat (Bug #7) + city nullish (N2)`
Body: см. сообщение коммита `fb5b4dc`.
Base: `release/appstore-rc1`.

Перед merge этого PR — проверь runtime: остался ли где-то «— → —»? Если нет — `FeedCard.js` defensive fallback из QA-ветки **не нужен**.

### D. После cherry-pick PR — закрыть QA-ветку

```bash
# на сервере или локально
git push origin --delete claude/qa-testing-urtruck-EiRlA
```

Документация (`QA_REPORT.md`, `PR15_VS_QA_COMPARISON.md`, `ASC_SUBMISSION_GUIDE.md`, `FINAL_STATUS.md`) можно либо потерять с веткой, либо сначала перенести в `docs/qa/` отдельным коммитом.

### E. ASC submission блокеры (новый трек, после релиза)

См. `ASC_SUBMISSION_GUIDE.md` в QA-ветке. Три блокера:

1. **Скриншоты** — снять с iOS Simulator (Pro Max 6.5"/6.7"/6.9") в нужных разрешениях. Делается на твоём Mac.
2. **Display Name пустой** в Xcode → требует `expo prebuild --clean` или ручной правки `Info.plist`.
3. **`eas.json` `ascAppId`** = `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`. Когда пришлёшь реальный ID из ASC → правлю в две минуты (нужен явный OK на eas.json).

**375 Xcode warnings** — не блокер, игнорировать. Все из чужого кода (Expo/RN-pods). См. отчёт в чате.

---

## Где какой PR / ветка

| Ветка | Назначение | Status | Действие |
|---|---|---|---|
| `release/appstore-rc1` | базовая релизная | стабильная | не трогать |
| `stage50-real-android-smoke-p0-fixes` | PR #15 owner | open, ждёт smoke | merge после owner OK |
| `claude/qa-testing-urtruck-EiRlA` | моя QA-ветка | 7 коммитов, чистая | НЕ мержить целиком, удалить после cherry-pick |
| `cherry-qa-after-pr15` | моя cherry-pick ветка | 1 коммит, чистая | PR ПОСЛЕ merge PR #15 |
| `main` | продакшен | стабильная | не трогать без CI |

---

## Чего я в любом случае не делаю без твоей явной команды

- Не открываю PR ни из QA-ветки, ни из cherry-qa-after-pr15
- Не делаю merge PR #15
- Не двигаю `main`
- Не правлю `app.json` / `eas.json` / native / push / version
- Не пушу в `release/appstore-rc1` напрямую
- Не трогаю TestFlight / EAS

---

## Какие команды я могу выполнить **сразу** по одной строке от тебя

1. `merge PR #15` → `mcp__github__merge_pull_request` на PR #15
2. `открой PR из cherry-qa-after-pr15` → `mcp__github__create_pull_request`
3. `пришли ascAppId 1234567890` → правлю `eas.json` и пушу как `fix-eas-asc-id`
4. `снимай блок на app.json, добавь CFBundleDisplayName` → правлю и пушу как `fix-app-display-name`
5. `закрой QA-ветку` → `git push origin --delete claude/qa-testing-urtruck-EiRlA`
6. `докатать локализацию X` → правлю i18n
7. `прогони build:web ещё раз` → `npm run build:web`

Без таких команд — **сижу и жду owner smoke**.
