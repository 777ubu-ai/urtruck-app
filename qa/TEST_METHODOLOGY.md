# UrTruck QA Test Methodology

## Purpose

Этот документ определяет **правильный порядок** тестирования UrTruck.
Тестировщики не должны начинать со случайных кнопок — это маскирует
реальные баги под «странности UI» и тратит время на полировку, пока
core-флоу сломан. Двигайтесь от smoke к happy path к бизнес-логике к
негативу и edge cases, и только потом — к UI.

Правило: **если уровень N не прошёл — НЕ переходите на N+1.**

---

## Level 0 — Smoke Test

**Цель:** убедиться, что приложение запускается и core-backend
отвечает. Если этого нет, дальнейшее тестирование смысла не имеет.

### Checklist
- [ ] App opens without crash
- [ ] Main screen loads
- [ ] Feed / backend responds (`/api/v1/system/info` → 200)
- [ ] Login screen reachable
- [ ] User can exit and reopen the app

### Stop rule
Если smoke не прошёл — **немедленно** возвращаем разработчику. Дальше
не идём.

---

## Level 1 — Happy Path

**Цель:** проверить, что обе целевые роли проходят свой основной
сценарий без обхода/хака.

### Cargo Owner (грузовладелец)
1. Login / register (телефон → OTP → role-select).
2. Complete profile (имя, город).
3. Create cargo (откуда, куда, описание, вес, объём, цена).
4. Publish cargo (форма принята backend'ом, возвращает `id`).
5. See cargo в «Мои грузы / Активные».
6. Receive bid (driver подал ставку — пуш / счётчик / карточка).
7. Open chat (через bid card → «Чат с водителем»).
8. Accept bid (статус → `accepted`, deal + chat_room созданы).
9. Complete deal (статус → `delivered`).

### Carrier (водитель)
1. Login / register.
2. Open feed (видит реальные грузы; нет тестового мусора).
3. Open cargo detail.
4. Submit bid (сумма + комментарий → 200 OK).
5. Open chat, когда разрешено (после accept или per-bid chat
   по статусу `pending`/`countered`).
6. Accepted deal появляется в «В работе».
7. Complete trip.

### Stop rule
Если happy path сломан — **fix до перехода на Level 2**. Иначе все
негативы и edge-кейсы будут только маскировать первичную поломку.

---

## Level 2 — Business Logic

**Цель:** проверить правила, которые UI не отображает, но backend
обязан соблюдать.

### Tests
- Required cargo fields (`from_city`, `to_city`, `cargo_desc`) — backend
  возвращает 400 при их отсутствии.
- **Bids на свой собственный груз** — заблокированы (нельзя сделать
  bid от owner'а cargo).
- Empty chat messages (`text == ""` и нет `photo_url`) — заблокированы.
- Accepted deal статус changes корректно: `active → taken (cargo) +
  accepted (deal)` → `delivered`.
- Duplicate actions предотвращены: повторный accept того же bid → 409
  «Ставку нельзя принять в статусе accepted».
- Permissions: пользователь НЕ может открыть чужой `chat_room` /
  `deal_id`. (Owner ↔ bidder только.)
- Zero-state screens рендерятся правильно (empty feed, empty chats,
  empty profile).
- Dynamic statuses локализованы — никакого raw `ACCEPTED`, `pending`,
  `taken` в RU-UI.

---

## Level 3 — Negative Testing

**Цель:** сломать систему намеренно. Здесь начинаются P0/P1 находки.

### Cases
- Invalid phone (`+1`, пустой, нечисловой).
- Wrong OTP repeatedly (3–5 раз) — должен сработать rate-limit.
- Huge photo upload (>5 MB) — компрессия или 413 error, без crash.
- Double-tap submit — нет двойного запроса (`busy`-флаг работает).
- Offline during send / upload — toast + retry, не «бесконечная
  крутилка».
- Special characters / script tags / SQL в text-инпутах — данные
  сохраняются как plain text, в UI рендерится экранированно.
- App backgrounded during upload — upload или завершается, или
  возобновляется при foreground'е, без потери файла.

---

## Level 4 — Edge Cases

**Цель:** проверить границы, которые юзер достигает редко, но
достигает.

### Cases
- Min / max price (0, 1, 999_999_999).
- Очень длинные имена / описания.
- Empty feed (новый юзер).
- 100+ cargos в feed — scroll performance ≥ 60fps.
- Long chat messages (>500 chars).
- Emoji / special symbols / RTL текст в полях.
- Long city names / routes (Северо-Казахстанская область etc).
- Small screen layout (iPhone SE, 4-inch).

---

## Level 5 — UI / UX

**Только после того как Level 2-4 прошли.** Полировка до этого
бессмысленна, потому что её можно потерять при rewrite сломанной
логики.

### Checks
- Buttons видимы и тапаются (hit-slop ≥ 8pt где надо).
- Loading states у всех async-actions.
- Error states (toast / inline) с понятным RU-текстом.
- Empty states с CTA-выходом (не тупик).
- Disabled states визуально отличаются от enabled.
- iPhone SE layout (375 × 667) — ничего не обрезано.
- RU / EN / KK / ZH text-overflow — особенно KK и DE.
- Dark / light theme если поддерживается — read-pass на каждом экране.

---

## Level 6 — Cross-platform

### Targets
- **iOS**: 16 / 17 / 18 (sdk 52 Expo Go) + standalone TestFlight build.
- **Android**: если поддерживается (build 63+).
- Small (4″) + large (6.7″) phones.
- Supported OS versions matrix.
- Все 4 языка (RU primary, EN, KK, ZH).

---

## Level 7 — Performance & Integration

**Цель:** проверить то, что не видно в single-shot smoke.

### Items
- Push on real device lock screen (APNS — **REAL DEVICE REQUIRED**).
- App launch time (cold / warm).
- Scroll performance (feed, chats list, cargo bids).
- Memory (no leaks при долгом chat'е).
- Weak network (2G / packet loss) — graceful.
- Offline behaviour (cached state, queue retry).

---

## Bug Report Template

```
🐛 [P0|P1|P2|P3] Title

Steps to reproduce:
1.
2.
3.

Expected:

Actual:

Environment:
- Device:       (iPhone 14 / iPhone 17 simulator / etc)
- OS:           (iOS 17.5 / etc)
- Build:        (Build 26 TestFlight / fix/X branch local)
- Backend:      (production urtruck.kz / local 127.0.0.1:8001)
- Language:     (RU / EN / KK / ZH)
- Theme:        (light / dark)

Screenshots / video:
- attach to issue

Severity:
P0 / P1 / P2 / P3
```

---

## Priorities

| | Definition | Examples |
| --- | --- | --- |
| **P0** | Blocks main journey · crash · data loss · security | App не запускается; OTP не приходит; «Принять» не работает; QA_AGENT_TOKEN утёк в repo |
| **P1** | Major flow broken, workaround сложный | «Мои грузы» дублирует cargos между вкладками; chat-room «Собеседник» вместо имени; owner не видит свой bid |
| **P2** | Important issue, workaround есть | Tab title vs page title не совпадают; «22» как plчисло-placeholder; missing testID; faded title в light theme |
| **P3** | Polish / minor | UTC time вместо local; raw `ACCEPTED` латиницей в RU; truncated chip label; queue chips overflow |

---

## Anti-patterns (что НЕ делать)

- ❌ Начинать с UI polish, когда happy path не пройден.
- ❌ Тестировать без знания ожидаемого результата («просто посмотрю
  что будет»).
- ❌ Делать заметку «потом проверю» — записывать в bug report сразу.
- ❌ Использовать production backend для negative-testing (создаёт
  мусор в реальной БД).
- ❌ Маркировать APNS push как «работает» без proof на реальном iPhone.
- ❌ Skiping Level 2 (business logic) — там самые серьёзные дыры.

---

## Tools используемые в проекте

- `scripts/release_static_gate.sh` — Level 0 static checks.
- `npm run qa:i18n` — i18n integrity.
- `npm run qa:ux` — UX invariants gate.
- `qa/maestro/*.yaml` — Level 1 (Maestro UI smoke).
- Backend `curl` через `qa/maestro/_lib/ensure-actor.{sh,js}` — Level 2
  (business logic loops без UI overhead).
- `Constants.appOwnership !== 'standalone'` — гарантия что dev-helpers
  (QA_HOOK_ALLOWED) скрыты в release-сборке.
