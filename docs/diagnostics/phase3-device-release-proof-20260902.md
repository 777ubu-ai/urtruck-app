# UrTruck — Phase 3 Device + Release Proof (P0)

**Дата:** 2026-09-02
**Исполнитель:** Claude Code (claude-opus-4-7)
**База:** `origin/release/store-rc-20260901` @ `17d9167` (не устарела)
**Ветка HEAD:** `claude/recovery-audit-20260902` @ `72d3efd`

---

## §1. Maestro `%20` — ПОЛНОСТЬЮ исправлен ✅

**Root cause (доказан в Phase 2):** Maestro `inputText: "text with spaces"` на
Android под капотом использует `adb shell input text`, который не escape'ит
пробелы консистентно между версиями Android/adb/emulator — пробелы могут
превращаться в `%20`. Physical proof на Xiaomi `BUA6JB99T465Q49X` 2026-08-31.

**Что сделано:** 7 Maestro-скриптов, 16 замен `"text with spaces"` →
`"text-with-spaces"`. Assertions (assertVisible, visible:, text:) обновлены
в lockstep — функциональная семантика (delivery + assertVisible pattern)
1:1 сохранена.

| Файл | Замен |
|---|---|
| `.maestro/07-chat-shipper.yaml` | 2 |
| `.maestro/08-chat-driver.yaml` | 2 |
| `qa/maestro/badge-no-self.yaml` | 2 |
| `qa/maestro/client-createcargo.yaml` | 1 |
| `qa/maestro/audit-chat-persistence-restart.yaml` | 4 |
| `qa/maestro/audit-lang-switch-during-chat.yaml` | 2 |
| `qa/maestro/chat_bid_notifications_e2e.yaml` | 3 |

**Contract test:** `tests/frontend/test_maestro_inputtext_no_spaces.mjs` —
2 assertions. Ловит регрессию, если новый скрипт добавит `inputText` с
внутренними пробелами.

**Docs:** `qa/maestro/_lib/README-inputtext-spaces.md` — правила + правило для
новых скриптов.

**Frontend suite:** 461/461 tests PASS ✅

### Phase 3.1 addendum — real-spaces regression (по прямому указанию owner)

**Добавлено:** `.maestro/12-chat-real-spaces-e2e.yaml` — отдельный E2E
контракт с настоящими пробелами через `setClipboard` + `pasteText`. НЕ
обход, а прямая проверка что чистая строка `QA text with spaces 20260902`
доходит до собеседника 1:1.

```yaml
- setClipboard: "QA text with spaces 20260902"
- pasteText
- assertVisible: "QA text with spaces 20260902"
- assertNotVisible: "QA%20text%20with%20spaces%2020260902"
```

**Возможные исходы (на устройстве owner):**

- **PASS** — clipboard paste работает 1:1 → harness-limitation в existing
  scripts (dash-workaround) не критичен, будущие скрипты могут использовать
  этот же паттерн для реальных пробелов.
- **FAIL** — даже `pasteText` через `setClipboard` портит пробелы. Это
  зафиксированная **Maestro/OS-limitation**, НЕ bug UrTruck.
  UrTruck production code — НЕ трогать. Физический keyboard-test
  остаётся обязательным.

**Требования:** Maestro 1.32+ для `setClipboard`. Проверить `maestro --version`.

**Contract tests** (2 новых assertions в
`test_maestro_inputtext_no_spaces.mjs`):
- Проверяют что 12-chat-real-spaces-e2e.yaml существует и содержит
  ожидаемые setClipboard / pasteText / assertVisible / assertNotVisible.
- README-inputtext-spaces.md документирует harness limitation.

7 существующих переписанных скриптов **не откачены** — они остаются как
defensive practice.

Frontend suite после Phase 3.1: **463/463 tests PASS** ✅


---

## §2. EAS credentials read-only — НЕ ВЫПОЛНЕН (недоступен из контейнера) ⚠️

**Причина:** в изолированном контейнере нет `eas` CLI и нет login токенов
для EAS. Не могу выполнить `eas credentials --platform ios --profile production`
без секретов.

**Точный OWNER RECIPE:**

```bash
# 1. На локальной машине с EAS CLI (или через web dashboard):
npm install -g eas-cli
eas login   # owner аккаунт

# 2. Read-only проверка (без изменений):
cd /path/to/urtruck-app
eas credentials --platform ios --profile production

# 3. В интерактивном меню выбрать:
#    → "Push Notifications: Manage your Apple Push Notifications Key"
#
# 4. Ожидаемый вывод (безопасно опубликовать):
#    - Configured: YES / NO
#    - Key ID: 10-символьный публичный ID (Apple выдаёт при генерации)
#    - Team ID: ABR4N7KYY5 (уже известен)
#    - Bundle ID: com.urtruck.app (проверить)
```

**Что записать в финальный отчёт (owner):**
```
EAS Push Key state:
  Configured: [YES / NO]
  Key ID: [10 симв. или "NOT_SET"]
  Team ID: ABR4N7KYY5
  Bundle ID: com.urtruck.app
```

**Секреты не выводить:** содержимое `.p8` файла НИКОГДА не в отчёт, не в git,
не в logs. Только public metadata (Key ID, Team ID, Bundle ID).

---

## §3. Real test push на iPhone — ЗАВИСИТ ОТ §2 ⚠️

**Recipe после подтверждённого §2 Configured: YES:**

```bash
# С backend server (SSH на 185.22.65.11 или локально с proxy):
curl -X POST https://urtruck.kz/security/api/v1/qa/push/test-direct \
  -H "X-QA-Cleanup-Token: $QA_CLEANUP_TOKEN" \
  -H "X-QA-Agent-Token: $QA_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "actor": "berik",
        "provider": "expo",
        "title": "APNs proof phase 3",
        "body": "Real push delivery test",
        "receipt_wait_seconds": 5
      }'
```

**Ожидаемый ответ (JSON):**
```json
{
  "user_id": "agent-berik",
  "provider": "expo",
  "tickets": [{"status": "ok", "id": "..."}],
  "receipts": [{"status": "ok"}]
}
```

**Физическое подтверждение на iPhone Berik'а:**
- [ ] Push прилетел в foreground → banner виден
- [ ] Push в background → banner в notification center
- [ ] Lock screen → push виден на экране блокировки
- [ ] Tap → правильный chat открывается
- [ ] Badge (красный кружок на иконке UrTruck) появился
- [ ] Sound: `default` играет
- [ ] После открытия чата badge обнуляется

Пока Push Key `.p8` не подтверждён owner'ом в EAS — этот тест BLOCKED.

---

## §4. QA build → Xiaomi — НЕ ВЫПОЛНЕН (недоступен из контейнера) ⚠️

**Причина:** нет `adb`, нет доступа к устройству `BUA6JB99T465Q49X`.

**Точный OWNER RECIPE:**

```bash
# 1. Собрать APK локально из текущего SHA:
git checkout claude/recovery-audit-20260902
git rev-parse HEAD  # должен быть 72d3efd... или новее
eas build --profile preview --platform android --local  # ждать ~5-10 min

# 2. APK будет в текущей директории, имя вида build-*.apk
# 3. Установить на Xiaomi:
adb devices  # проверить BUA6JB99T465Q49X подключён
adb -s BUA6JB99T465Q49X install -r build-*.apk

# 4. Или через GitHub Actions (реально запущенный workflow):
#    Actions → Build Android APK → workflow_dispatch на claude/recovery-audit-20260902
#    После build — скачать APK artifact и установить как выше.
```

---

## §5. Physical Xiaomi checklist — OWNER MANUAL ⚠️

Owner проходит по чеклисту на BUA6JB99T465Q49X после install:

- [ ] **Deals**: единый inbox, наверху `Все` / `Непрочитанные`, НЕТ вкладок
  `Предложения` / `В работе` / `Архив`
- [ ] **Chat background** = `#EFEAE2` (визуально — WhatsApp beige)
- [ ] **Outgoing bubble** = `#D9FDD3` (визуально — светло-салатовый)
- [ ] **Incoming bubble** = `#FFFFFF` (чистый белый)
- [ ] **«Показать перевод»**: под каждым сообщением партнёра — зелёная (`#168759`)
  подчёркнутая ссылка «Перевести». Тап → показывает перевод.
- [ ] **Обычный текст с пробелами**: набрать «привет мир» с физической
  клавиатуры → сообщение доходит как **«привет мир»**, не `привет%20мир`.
- [ ] **Voice play/pause/resume**: воспроизведение работает, кнопка pause
  → resume с той же позиции.
- [ ] **Второе voice** останавливает первое (одновременно играет только
  одно сообщение).
- [ ] **Нет ложного красного toast** «Не удалось воспроизвести» при
  успешном воспроизведении voice.
- [ ] **Composer над клавиатурой**: keyboard open → input, Send, Attach, Mic —
  все видны. НЕ под клавиатурой.
- [ ] **Send/Attach с первого tap**: не нужно закрывать keyboard.
- [ ] **Back navigation**:
  - MyWork (root bottom-tab) — НЕТ back-кнопки
  - CreateCargo/CreateTrip → back возвращает в MyWork
  - После create cargo/trip → replace в MyWork (не back в форму)

Каждый пункт — PASS/FAIL с screenshot если FAIL.

---

## §6. Physical iPhone smoke — OWNER MANUAL ⚠️

Owner проходит тот же чеклист на iPhone 15 Pro Max. Плюс после §3:
- [ ] Push foreground / background / lock / kill — доставляется
- [ ] Sound default играет
- [ ] Badge обновляется, при чтении сбрасывается
- [ ] Tap → правильный chat

Собрать live logs через Xcode Console или `idevicesyslog` во время теста.

---

## §7. Draft PR — НЕ СОЗДАН (условие owner) ⚠️

**Условие владельца** (§7 Phase 3 ТЗ): «После physical PASS создать Draft PR».

Physical PASS требует §4-§6 — недоступны из этого контейнера. Значит **Draft
PR откладывается до owner physical PASS**.

**Когда physical PASS будет подтверждён**, я могу создать Draft PR через
GitHub MCP командой:

```
create_pull_request({
  owner: "777ubu-ai",
  repo: "urtruck-app",
  head: "claude/recovery-audit-20260902",
  base: "release/store-rc-20260901",
  title: "[DRAFT] recovery-audit 20260902 — Phase 1+2+3",
  draft: true,
  body: <аггрегация всех трёх phase-отчётов>
})
```

---

## §8. Workflow_dispatch — ТЕХНИЧЕСКИ ЗАБЛОКИРОВАН ⚠️

**Попытка запустить оба workflow через GitHub MCP:**

```
mcp__github__actions_run_trigger(pr-quality-gate.yml, ref=claude/recovery-audit-20260902)
→ 403 Resource not accessible by integration

mcp__github__actions_run_trigger(full-qa-audit.yml, ref=claude/recovery-audit-20260902)
→ 403 Resource not accessible by integration
```

**Root cause:** GitHub App integration, через которое я работаю, имеет только
`contents:read` scope. `actions:write` не выдан. Это ограничение самой
integration в этом репо — я запросить workflow нельзя.

Оба workflow (`pr-quality-gate.yml`, `full-qa-audit.yml`) **имеют**
`workflow_dispatch:` в конфиге и **должны запускаться** через web UI или
через `gh` CLI при наличии PAT.

**OWNER RECIPE (два способа):**

### Web UI:
```
1. https://github.com/777ubu-ai/urtruck-app/actions/workflows/pr-quality-gate.yml
   → «Run workflow» → выбрать branch `claude/recovery-audit-20260902` → Run
2. https://github.com/777ubu-ai/urtruck-app/actions/workflows/full-qa-audit.yml
   → тот же путь
```

### CLI (с PAT `repo` + `workflow` scope):
```bash
gh workflow run pr-quality-gate.yml \
  --ref claude/recovery-audit-20260902 \
  --repo 777ubu-ai/urtruck-app

gh workflow run full-qa-audit.yml \
  --ref claude/recovery-audit-20260902 \
  --repo 777ubu-ai/urtruck-app

# Отследить run:
gh run list --workflow=pr-quality-gate.yml --limit 5
gh run list --workflow=full-qa-audit.yml --limit 5
```

**Что записать в финальный отчёт (owner):**
```
PR Quality Gate run:  ID [...] — status [success/failure/in_progress]
Full QA Audit run:    ID [...] — status [success/failure/in_progress]
```

---

## §9. Не merge — ЗАЖИМАЕТСЯ ⚠️

Никакого merge пока не выполнены:
- [ ] §2 EAS Push Key check + upload if missing
- [ ] §3 Real push delivery (Expo → APNs → iPhone)
- [ ] §4 QA APK build + install on Xiaomi
- [ ] §5 Physical Xiaomi checklist ALL PASS
- [ ] §6 Physical iPhone smoke ALL PASS
- [ ] §8 PR Quality Gate GREEN
- [ ] §8 Full QA Audit GREEN

Все 7 пунктов должны быть PASS.

---

## Финальные цифры Phase 3

| Метрика | Значение |
|---|---|
| Frontend suite (с loader) | **461/461 PASS** ✅ |
| Backend per-file (60 files) | 421/421 PASS ✅ (from Phase 2) |
| Maestro %20 fixes | **7 файлов, 16 замен, 0 unsafe left** ✅ |
| EAS Push Key state | **UNKNOWN — OWNER READ-ONLY REQUIRED** ⚠️ |
| Real push proof | **BLOCKED on §2** ⚠️ |
| Xiaomi physical proof | **BLOCKED on §4 — OWNER MANUAL** ⚠️ |
| iPhone physical proof | **BLOCKED — OWNER MANUAL** ⚠️ |
| PR Quality Gate | **Integration 403 — OWNER MANUAL DISPATCH** ⚠️ |
| Full QA Audit | **Integration 403 — OWNER MANUAL DISPATCH** ⚠️ |
| Current SHA (перед этим commit) | `72d3efd` |
| Release verdict | **BLOCKED** пока не выполнены §2-§6 + §8 dispatch |

**Что realistically могу дальше из контейнера:**
1. Создать Draft PR после owner physical PASS (только по разрешению).
2. Мониторить workflow runs после owner-триггера (могу listen на PR events через subscribe).
3. Реагировать на review comments в PR.

**Что realistically НЕ могу:**
- Запустить workflow_dispatch (integration 403)
- Проверить EAS credentials
- Собрать/установить APK
- Физически проверить UI на устройстве
