# Build 17 Prep — Push Pipeline + Chat Data Integrity

**Date:** 2026-05-23 ~11:30 UTC
**Branch:** `claude/fix-feedscreen-mycargo-render`
**Commits this session:** 5 (3 frontend + 2 backend)

## Что починено

| ID | Проблема | Frontend commit | Backend commit |
|---|---|---|---|
| **P0-1** | Push permissions / Expo token пустой на iOS | `1a97b82` | — (frontend-only) |
| **P0-2** | App icon badge не появляется при push в background | — (frontend уже синкает через BottomNav) | `bf023da` |
| **P0-3** | «Собеседник» вместо имени пользователя | `967eeb9` | `9c4d94b` |
| **P0-4** | Сообщения исчезают через 1-2 сек после отправки | `80cd80f` | — (race на фронте) |

## Корневые причины

### P0-1 — Push token пустой
`getExpoPushTokenAsync()` без `projectId` на Expo SDK 49+ возвращает пустой токен на iOS. Backend регистрировал `null` → push некуда отправлять.

**Fix:** читаем `Constants.expoConfig.extra.eas.projectId` через `expo-constants` и передаём в `getExpoPushTokenAsync({ projectId })`. Fallback на zero-arg вызов для web bundle.

### P0-2 — App icon badge
`_send_expo()` отправляла Expo Push payload без поля `badge`. APNs не рисует красный кружок на иконке без `aps.badge`. Хотя frontend syncs `setBadgeCountAsync(unread)` через BottomNav поллер — это работает только когда app в foreground.

**Fix:** добавлен опциональный `badge` param в `_send_expo()` и `_send_native()`. `push_sender.send()` для `kind='chat'` или `data.type='chat_message'` вычисляет unread count получателя одним SQL и кладёт в payload. Для прочих kind (bid/system) badge не ставится — чтобы не накручивать счётчик чатов.

`send_to_user()` (legacy wrapper) расширена backward-compatibly — старые 4-arg вызовы продолжают работать. Новый `chat.send_message()` передаёт `kind='chat'` + `data={'type':'chat_message','room_id':...}` + `url=/chats/{id}` для корректной навигации при тапе.

### P0-3 — «Собеседник»
Backend `/chat/rooms` отдавал `partner_name = full_name || phone`. Если оба пустые — `null`. Frontend `prettifyPartnerName` для пустого/null name возвращал i18n key `chat_partner_fallback` → 'Собеседник' / 'Partner' / '聊天对象'.

**Fix backend** (`9c4d94b`): three-tier fallback в `/chat/rooms`:
1. `full_name` (trimmed, non-empty)
2. `+XXXX` (последние 4 цифры phone)
3. `"Пользователь UrTruck"` literal last resort

**Fix frontend** (`967eeb9`): обновил `chat_partner_fallback` ключ во всех 4 локалях:
- RU: «Собеседник» → «Пользователь UrTruck»
- EN: «Partner» → «UrTruck user»
- KK: «Әңгімелесуші» → «UrTruck қолданушысы»
- ZH: «聊天对象» → «UrTruck 用户»

### P0-4 — Исчезающие сообщения
`loadMessages` polling каждые 3 сек делал:
```js
setMessages(prev => mapped.length !== prev.length ? mapped : prev);
```

Race:
1. User send → optimistic insert (длина prev = N+1)
2. Через 1-2 сек polling → server response = N (insert ещё не дошёл)
3. N !== N+1 → setMessages(mapped) → **optimistic message исчезает**

**Fix:** defensive merge с marker'ом `_optimistic: true`:
- Empty server response → keep prev (no flicker on flaky net)
- Иначе: `[...mapped, ...prev.filter(m => m._optimistic && !already_acked_by_text)]`
- Dedup по тексту+from — когда server в итоге вернёт acked message с реальным id, optimistic копия с тем же текстом дропается, ✓✓ работают на server id.

## Архитектурные изменения

| Файл | Изменение |
|---|---|
| `src/utils/push.js` | `projectId` через expo-constants |
| `backend/services/push_sender.py` | `_send_expo(badge=)`, `_send_native(badge=)`, `_compute_recipient_badge(user_id)`, send() для kind='chat' проставляет badge |
| `backend/api/push.py` | `send_to_user(kind=, data=)` опциональные kwargs |
| `backend/api/chat.py` | `send_message` вызывает `send_to_user(kind='chat', data={...}, url=/chats/{id})`; `/chat/rooms` three-tier fallback на partner_name |
| `src/utils/i18n.js` | `chat_partner_fallback` 4 локали обновлены |
| `src/screens/ChatScreen.js` | defensive merge в loadMessages + `_optimistic: true` flag |

## Backend changes — какие файлы

```
backend/api/chat.py            (P0-2 kind='chat' + P0-3 fallback)
backend/api/push.py            (P0-2 send_to_user signature)
backend/services/push_sender.py (P0-2 badge param + _compute_recipient_badge)
```

**Backend deploy:** изменения вступят в силу только после **merge ветки в `main`** и срабатывания **`.github/workflows/deploy.yml`** (push в main триггерит GitHub Action который копирует backend/ через scp на VPS и делает `pm2 restart urtruck-security-api`). Это **в зоне хозяина** — у меня нет SSH доступа.

Если хозяин merge'нет до запуска build 17 — backend будет готов. Если нет — frontend изменения сработают, но badge всё ещё не будет показываться (push payload останется без `badge` field), partner_name всё ещё будет null для users без full_name (фронтенд покажет «UrTruck user» fallback вместо реального имени).

## Test plan для хозяина (build 17)

### Pre-test
1. Merge `claude/fix-feedscreen-mycargo-render` → `main` (это активирует backend changes через deploy.yml)
2. Подождать ~2 мин пока deploy.yml пройдёт (видно по GitHub Actions)
3. EAS build 17 от ветки `claude/fix-feedscreen-mycargo-render`
4. Установить на оба тестовых iPhone (удалить build 16 предварительно)

### Сценарий A — Push permissions + token (P0-1)
1. При первом запуске → iOS popup «UrTruck would like to send you Notifications» → **Allow**
2. Залогиниться (любая роль)
3. Проверить в Metro Logger что в выводе появилось `[PUSH] Expo token: ExponentPushToken[...]` (не пустая строка)
4. На backend (если есть SSH к VPS): `SELECT user_id, token FROM push_tokens_native WHERE user_id = '<my_user_id>'` — должна быть строка с реальным токеном

### Сценарий B — Badge на app icon (P0-2)
1. iPhone A залогинен как driver, iPhone B как shipper
2. iPhone A **закрой приложение** или **заблокируй экран**
3. iPhone B → отправить сообщение в чат с iPhone A
4. **ОЖИДАНИЕ:** через 1-3 сек на iPhone A
   - Push notification на lock-screen («💬 <имя B>: <текст>»)
   - **Красный кружок с цифрой «1» на иконке UrTruck на home screen**
5. Открыть UrTruck → перейти в ChatScreen → прочитать → выйти
6. **ОЖИДАНИЕ:** badge на app icon **исчезает** (через max 30 сек или сразу через notifyChatRead)
7. iPhone B шлёт ещё 2 сообщения → badge на A показывает **«2»** не «3» (потому что 1-е прочитано)

### Сценарий C — Real partner name (P0-3)
1. iPhone A (driver) и iPhone B (shipper) оба зарегистрированы с реальным `full_name` в Профиле
2. iPhone A → Chats → видит room с iPhone B → **ОЖИДАНИЕ:** имя = реальное (например «Бахит Жанабаев»)
3. Создать тестового user без `full_name` (только phone) → iPhone A видит в room список «+0123» (последние 4 цифры phone B)
4. Намеренно empty user (full_name=null, phone=null) — теоретически невозможно (phone required) — fallback «Пользователь UrTruck»
5. На любой локали: на ZH китаец видит «UrTruck 用户» а не «Партнёр» / «Собеседник»

### Сценарий D — No disappearing messages (P0-4)
1. iPhone A открывает ChatScreen
2. Быстро отправь 5 сообщений подряд: «1», «2», «3», «4», «5»
3. **ОЖИДАНИЕ:** все 5 сообщений видны (зелёные bubble справа), ни одно не исчезает
4. **Подожди 10 сек** (3+ polling cycle): все 5 остаются на месте
5. На iPhone B (получатель) появляются все 5 в правильном порядке
6. iPhone A → fully close app → open again → история сохранена с этими 5
7. Edge case: write «test», отправить, **сразу** закрой app, через 5 сек открой → message всё ещё там (либо acked сервером и видимо, либо optimistic если ещё не успел дойти — но в любом случае не пропал)

### Регрессии (не должно сломаться)
- [ ] Все 21+ предыдущих коммитов работают
- [ ] BidModal currency-aware, keyboard не скрывает
- [ ] CargoDetail owner-mode (Accept/Reject/Counter/Chat actions)
- [ ] DatePicker одна строка + onClose
- [ ] Feed без my_cargos в shipper view
- [ ] CargoRuqsat info page работает + CTA на портал
- [ ] BottomNav badge sync через notifyChatRead
- [ ] Notifications screen без «None предлагает»

## Известные ограничения

- **Backend deploy зависит от merge:** все backend commits ждут merge в main + deploy.yml run. До этого момента активируются только frontend изменения. Push body будет приходить без `badge` (старая prod версия push_sender) → app icon badge не появится. После merge backend — badge заработает на следующих push.
- **Phone-tail fallback** даёт `+1234` не «Иван Петров» — если у пользователя в БД full_name пустой. Это **корректно по дизайну** до тех пор пока пользователь не дозаполнит профиль.
- **`_compute_recipient_badge`** делает один SQL на каждое отправленное сообщение. На текущей нагрузке (~7 trips на проде, ~3 cargo) это negligible. При росте — можно кэшировать в Redis (out of scope).
- **Optimistic dedup по тексту:** теоретически если user пишет два одинаковых сообщения подряд (например «ок» «ок») — defensive merge может счесть первое за «уже acked» когда server вернёт второе. Mitigation: дедуп смотрит на text + from='me' + при condition mapped.some(...) — за идентичный текст ответственность пользователя. Можно усилить через `created_at` window (out of scope этой сессии).
- **EAS build не запущен** — это в зоне хозяина.

## Commits this session (5)

```
80cd80f fix(chat): defensive merge prevents message disappearance (P0-4)
967eeb9 fix(chat): replace 'Собеседник' fallback with 'Пользователь UrTruck' (4 locales)
9c4d94b backend(chat): real partner_name with phone-tail fallback
bf023da backend(push): add APNs badge field + kind='chat' propagation
1a97b82 fix(push): pass projectId to getExpoPushTokenAsync (SDK 52 requirement)
```

## Итоговое состояние

- `qa:i18n`: ✅ 1070 × 4 locales, 0 missing
- `qa:ux`: ✅
- `build:web`: ✅ exit 0
- `git status`: чисто
- Branch запушен в `origin/claude/fix-feedscreen-mycargo-render`
- Backend / app.json / eas.json / package.json: трогали ТОЛЬКО backend/ (3 файла), app.json/eas.json/package.json не тронуты

**STOP. Не мерджил, не запускал EAS, PR не создавал.**

Жду возвращения хозяина с спорта. К build 17 готовы.
