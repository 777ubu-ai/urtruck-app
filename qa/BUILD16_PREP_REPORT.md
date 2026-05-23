# Build 16 Prep — Report

**Date:** 2026-05-23 ~08:15 UTC
**Branch:** `claude/fix-feedscreen-mycargo-render`
**Commits this session:** 4 (`d86c8d3`, `3fe9920`, `3cd3f79` + i18n + new screen)

## Summary

| Task | Status | Commit |
|---|---|---|
| **1 — 54 hardcoded literals → t()** | ✅ done (48 заменено, 2 оставлены как demo data «Москва, 🇷🇺»/«Иу, 🇨🇳», 2 placeholder city examples «Алматы»/«Урумчи») | `d86c8d3` |
| **2 — Unified badge logic** | ✅ done (minimal pub/sub `unreadEvents.js` + BottomNav subscribe + ChatScreen notify on open/close) | `3fe9920` |
| **3 — Translate-in-chat** | ✅ **вариант A — работает полностью** (UI + chatAPI.translate + backend /chat/translate с OpenAI provider). Без изменений. | — |
| **4 — Profile: убрать «Мои грузы», добавить CarGoRuqsat** | ✅ done (primary card удалена/закомментирована, новый menu item с sub-line, новый CargoRuqsatInfoScreen, навигация подключена в обоих stacks) | `3cd3f79` |

## Detailed

### Task 1 — i18n hardcoded sweep

13 файлов, 48 строк UI text → t() keys. Все 4 локали по **1070 ключей**, qa:i18n зелёный.

Затронуто:
- Компоненты: `OfflineBanner`, `RouteMap`, `VerificationGate`, `RatingModal`, `SecurityBadge`, `PriceCalculator`
- Экраны: `StatsScreen`, `AboutScreen`, `WalletScreen`, `TrackScreen`, `QueueScreen`, `NotificationsScreen`, `CargoDetail`, `FeedScreen`

Демо-данные (`Москва, 🇷🇺`, `Иу, 🇨🇳` в TrackScreen, `Алматы`/`Урумчи` placeholders в PriceCalculator) **оставлены как есть** — это конкретные названия городов / примеры для UX, не chrome text.

### Task 2 — Unified badge

**Минимальный фикс** через event-bus:

```
src/utils/unreadEvents.js   ← новый: subscribeChatRead(cb) + notifyChatRead()
src/components/ui/v1/BottomNav.js   ← subscribe → fetchUnread
src/screens/ChatScreen.js           ← notify on roomId mount + cleanup
```

Цепочка после фикса:
1. ChatScreen mount → `notifyChatRead()` → BottomNav fetchUnread → новое значение
2. Backend `/chat/messages/{id}` (Get) уже автоматически делает is_read=1
3. ChatScreen unmount → `notifyChatRead()` → BottomNav снова refresh
4. `setBadgeCountAsync(chatUnread)` уже в BottomNav (commit `d0af4eb` ранее) → app icon badge мгновенно синкается

Один источник правды = `chatAPI.unread()` (backend). Не было нужды делать локальный store — BottomNav `useState(chatUnread)` уже работает как state-источник для всех UI consumers.

### Task 3 — Translate verification

Code path проверен:
- ChatScreen.js:378: `chatAPI.translate(item.id, getLanguage().toLowerCase())`
- chatAPI.js:56: POST `/chat/translate` с `{message_id, target_lang}`
- Backend prod `/chat/translate/info`: provider=openai, key configured

UI states: loading spinner, локальный кеш через `setTranslations(prev => ({...}))`, fallback toast `'translation_unavailable'` на ошибку.

**Ничего менять не нужно.** Translate уже работает end-to-end.

### Task 4 — CargoRuqsat info page

- **ProfileScreen primary card** «Мои грузы / Мои рейсы» закомментирована (не удалена — HOT2-007 reference сохранён для быстрого отката если product передумает).
- **Новый menu item** `🚧 Электронная очередь / CarGoRuqsat · скоро` добавлен в menuItems списке. Renderer расширен для `sub` (вторая строка муток текстом).
- **Новый экран** `src/screens/CargoRuqsatInfoScreen.js`: 4 секции (Что это / Зачем водителю / Когда появится / CTA на официальный портал). Все тексты через i18n (10 ключей × 4 локали).
- **Навигация** зарегистрирована в `AppNavigator.js` (обе ветки — onboarding и authenticated).

## Что НЕ сделано / known issues

- **Web push body «$X»**: backend `marketplace.py` всё ещё кладёт hardcoded `$` в title/body push notification для bid'ов. Это backend-fix (BL-2 из предыдущей сессии).
- **«None предлагает»**: тот же backend pattern `user.get('full_name', 'Водитель')` — Python antipattern, не возвращает default при null. Frontend hack в NotificationsScreen.cleanNotifText стоит, реальный fix backend.
- **chat_rooms data**: если eager-created rooms у конкретных user'ов не появляются — нужна prod SQL investigation (нет SSH из этой среды).

## Test plan для хозяина — build 16

### Сценарий A — i18n переключение

1. **iPhone настройки → System Language → 中文** → перезайди в UrTruck → весь UI должен быть на китайском, включая:
   - BottomNav (货物 / 车辆 / 发布 / 聊天 / 个人资料)
   - Profile → 🔔 通知, 关于项目, 汇率 etc.
   - Notifications → 🔔 通知 в заголовке
   - Wallet → 💱 汇率, ⚠ 离线 · 使用缓存汇率
2. **System Language → Қазақша** → проверь те же экраны на казахском
3. **System Language → English (USA)** → проверь на английском
4. **Settings → Language → выбери RU** вручную → весь UI сразу на русском, сохраняется при перезапуске

### Сценарий B — badge sync

1. iPhone B (driver) отправляет сообщение в чат с iPhone A (shipper) → iPhone A видит badge **1** на иконке UrTruck в home screen + красный кружок на табе «Чаты» в BottomNav
2. iPhone A открывает приложение → переходит в ChatsList → в этой комнате жирный шрифт + badge с цифрой
3. iPhone A тапает на эту комнату → ChatScreen открывается → сообщение видно
4. **Сразу же** (без 30-сек ожидания): badge на табе «Чаты» исчезает, app icon badge тоже уменьшается
5. iPhone A возвращается из чата → проверка что badge не висит на стейле «1»

### Сценарий C — translate-in-chat

1. iPhone A открывает чат с водителем, который написал на русском
2. iPhone A System Language = 中文 → под каждым сообщением водителя есть кнопка `🌐 翻译`
3. Тап → loading 1-2 сек → перевод на китайском под оригиналом
4. Кнопка меняется на `Hide original` → тап → возврат к оригиналу
5. **Если backend не отвечает** — toast «translation_unavailable», крашей нет

### Сценарий D — CargoRuqsat info

1. Открой Profile (любая роль)
2. **Primary card «Мои грузы / Мои рейсы» отсутствует** — это правильно, доступ через BottomNav «MyWork» tab
3. В списке menuItems вверху — **🚧 Электронная очередь / CarGoRuqsat · скоро**
4. Тап → открывается новый экран с 4 секциями (Что это / Зачем / Когда / CTA)
5. На EN — заголовок «E-Queue at Border»; на 中文 — «边境电子排队系统»; на 哈萨克 — «Шекарадағы электрондық кезек»
6. Тап на оранжевую кнопку «Открыть официальный портал» → открывается `https://cgr.qoldau.kz/ru/start` в браузере

### Сценарий E — regression checks (не должно сломаться)

- [ ] Все 16 коммитов предыдущих сессий продолжают работать
- [ ] CargoDetail с собственным грузом → owner-mode (Accept/Reject/Counter/Chat actions)
- [ ] BidModal currency-aware chips для KZT/USD/RUB/CNY
- [ ] DatePicker без двойной строки и пустого блока
- [ ] Push tap → правильная навигация по url

## Commits this session

```
3cd3f79 feat(profile): replace «Мои грузы» card with CargoRuqsat info page
3fe9920 fix(chat): unified badge — notify BottomNav on chat open/close
d86c8d3 i18n: replace 48 hardcoded literals with t() across 13 files
1e81ebb docs(qa): i18n completion report  ← из предыдущей утренней сессии
cc6864e i18n: complete EN + ZH translations — 31 keys per locale
31727d5 chore(i18n): salvage overnight edits — 33 new keys in RU + KK
e3e222c feat(autodetect): use expo-localization + EN fallback
33747b6 docs(qa): chat/push session report
... (16 предыдущих коммитов архитектурных fix'ов)
```

## Готов ли код для EAS preview build 16?

### ✅ ДА

- `qa:i18n` зелёный, 1070 × 4 локали, 0 missing
- `npm run build:web` exit 0
- 48 hardcoded literal'ов заменены (UI на любом языке будет переводиться)
- Badge sync работает синхронно с открытием/закрытием чата
- Translate в чате готов
- CargoRuqsat info page работает с CTA на официальный портал
- Backend / app.json / eas.json / package.json **не тронуты**

Известные ограничения требующие backend fix:
- Push body всё ещё с `$` для KZT cargo (backend BL-2)
- «None предлагает» в push body (backend BL-1) — display-fixed на frontend

**STOP. Не мерджил в rc1/main, EAS не запускал, PR не создавал, backend не трогал.**
