# UrTruck — Recovery-audit report (P0)

**Дата:** 2026-09-02
**Исполнитель:** Claude Code (claude-opus-4-7)
**База:** `origin/release/store-rc-20260901` @ `17d9167`
**Working branch:** `claude/recovery-audit-20260902`
(создана, т.к. `claude/youthful-cerf-barf3` на remote не FF-совместима с
release, а force-push заблокирован политикой сессии)

## Git

- **Starting SHA:** `17d9167` (release/store-rc-20260901)
- **Final SHA:** `70941af` (тот же content, что и `claude/youthful-cerf-barf3` предыдущей сессии, но на актуальной release базе)
- **Clean tree?** yes
- **Пути коммитов (top-down):**
  - `70941af` — P0/P1 iOS push chain диагностика + QA deal cleanup endpoint
  - `1063c6b` — P0 §1-§17: recovery-audit — unified deals inbox + chat canon freeze
  - `17d9167` — release RC starting point

## §1 Root cause DEALS-регрессии — доказан Git archaeology

| SHA | Дата | Смысл |
|---|---|---|
| `0b2c11e` | 2026-08-04 | refactor: replace deal tabs with unified inbox — **правильный канон** |
| `d730aaa` | 2026-08-04 | fix: remove deal duplication from work screens |
| `e036e53` | 2026-08-19 | feat(deals): WhatsApp-style floating deal inbox — **тайно вернул 3 вкладки** |
| `379f7b1` | 2026-08-19 | Merge PR #243 — регрессия слита в main |

Регрессия проведена под маркетинговым названием «WhatsApp-style». Даже
комментарий в `ChatsListScreen.js` роутере признавал «owner-approved
compact WhatsApp-style deal inbox», хотя за словом «WhatsApp-style»
скрывались именно вкладки Предложения / В работе / Архив.

## §2/§3 DEALS — unified inbox restored ✅

**Изменения:**
- `src/screens/DealsScreen.js` — 3 вкладки → 2 (Все / Непрочитанные)
- Дефолт `dealTab`: `'offers'` → `'all'`
- `baseItems`: unified merge (offers + active + archived + closedBids) по свежести
- Архив = свойство карточки (isArchived → dimmed), не вкладка
- `src/screens/ChatsListScreen.js` — роутер всегда возвращает `<DealsScreen />` (Legacy отключён)
- `tests/frontend/test_deals_whatsapp_floating_header.mjs` переписан под новый канон

**Contract tests:** `test_deals_unified_inbox_contract.mjs` (10 assertions PASS)

## §5 Chat canonical colors freeze ✅

**Изменения:**
- `DealWorkspaceScreenV2`: `chatFullscreen`/`chatBody` bg `'#F4EFE7'` → `'#EFEAE2'`

**Contract tests:** `test_chat_canonical_colors_freeze.mjs` (4 PASS)

Freeze doc: `docs/product/CHAT_CANON.md`

## §6 «Показать перевод» — visibility restored ✅

**Изменения:**
- `ChatScreen.js`: color `theme.textMuted` → `'#168759'` + `underline`, fontSize 11 → 12, fontWeight 600
- `DealWorkspaceV2`: `translateText` color `#667781` → `#168759` + underline; globe icon color/size

**Contract tests:** `test_chat_translation_button_visible.mjs` (4 PASS)

## §7 %20 encoding — contract added, activity absent from RC code ✅

Static analysis показала: в `src/utils/chatAPI.js`, `src/screens/ChatScreen.js`,
`src/screens/DealWorkspaceScreenV2.js` `encodeURI/encodeURIComponent`
на `text` — отсутствует. `decodeURIComponent` на пришедший text —
отсутствует. Backend `body.text` пишет as-is. Значит физический баг
`%20` либо уже устранён, либо возникает через специфический QA-путь.

**Contract tests:** `test_chat_message_encoding_contract.mjs` (5 PASS) —
preventive regression.

## §8 Voice `_playResolve` ReferenceError guard ✅

**Root cause подтверждён runtime-репро:**
```
node -e 'try{if(_playResolve){}}catch(e){console.log(e.message)}'
→ "_playResolve is not defined"
```

**Изменения:**
- `voiceRecorder.js`: `let _playResolve = null;` на module scope (line 22)
- `try/catch` вокруг `_sound.unloadAsync()` против stale sound

**Contract tests:** `test_voice_playresolve_declared.mjs` (4 PASS)

## §9 Voice false red toast — fixed ✅

**Root cause:** `run` IIFE в `voice.play()` возвращала `undefined` при
успехе (не было `return true` после `sound.setOnPlaybackStatusUpdate`).
`ChatScreen` делал `if (!ok) toast(...)` → **ложный тост** «Не удалось
воспроизвести» на успешном воспроизведении.

**Изменения:** `return true;` после `setOnPlaybackStatusUpdate(...)`.

## §10 Keyboard / composer above keyboard ✅

**Root cause:** `DealWorkspaceScreenV2` объявлял
`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. `undefined` на
Android = no-op → композер под клавиатурой.

**Изменения:** Android `'height'`. iOS остался `'padding'`.

**Contract tests:** `test_chat_keyboard_avoiding_contract.mjs` (3 PASS)

## §11 Back navigation (MyWork stack) ✅

**Всё уже правильно в текущем RC:**
- MyTripsScreen (root bottom-tab) — только menu, нет back
- CreateCargo/CreateTrip: BrandHeader onBack → goBack
- После create: `navigation.replace('MyTripsList')` (не push)

**Contract tests:** `test_mywork_stack_back_navigation.mjs` (5 PASS)

## §12/§13 Push / APNs — статус

**iOS push chain** доказательно проанализирован в предыдущей сессии:
- `docs/diagnostics/ios-push-qa-cleanup-20260902.md`
- 8 контрактных тестов (`backend/tests/test_ios_push_chain_contract.py`) PASS
- **Наиболее вероятный root cause:** отсутствие APNs P8-ключа в EAS
  проекте `898bd902-ea62-49f6-96c3-b6e02219f828`.

**OWNER ACTION REQUIRED:**
1. Открыть Expo Dashboard → Project → Credentials → iOS
2. Проверить наличие Push Key (.p8) + Key ID + Team ID `ABR4N7KYY5`
3. Если нет — загрузить через `eas credentials`
4. Никаких fake `.p8`, никаких committed private keys — только через
   secret store.

Пока P8 отсутствует, iOS push остаётся **BLOCKED**, но НЕ блокирует
остальные фиксы этой сессии.

## §14 Server / DB — не удаляли ничего

Backend не тронут в этой сессии recovery-audit (моя работа — frontend
+ docs). QA deal cleanup endpoint (POST `/qa/cleanup/deals` + preview)
из прошлой сессии остался в этом же commit — dry_run по умолчанию,
confirm обязателен для мутации, backup в ответе.

## §15 Legacy paths

- `ChatsListLegacyScreen.js` — **не импортируется** (был живой ветвью,
  показывающей 3 старых вкладки для standalone маршрутов). Оставлен
  на диске под плановую чистку.
- `ChatsListScreen.js` роутер — теперь всегда `<DealsScreen />`.

## §16/§17 Canon docs

- `docs/product/DEALS_CANON.md` — freeze rules + история регрессии
- `docs/product/CHAT_CANON.md` — палитра + функциональный freeze

## §18/§19 Contract tests (обратные regression-защиты)

Новые файлы:
- `test_voice_playresolve_declared.mjs` (4 tests)
- `test_chat_message_encoding_contract.mjs` (5)
- `test_chat_translation_button_visible.mjs` (4)
- `test_chat_keyboard_avoiding_contract.mjs` (3)
- `test_chat_canonical_colors_freeze.mjs` (4)
- `test_mywork_stack_back_navigation.mjs` (5)
- `test_deals_unified_inbox_contract.mjs` (10)

Переписанные:
- `test_deals_whatsapp_floating_header.mjs` — под unified canon
- `test_status_push_pro_filter_contract.mjs` — обновлён regex

**Всего добавлено ~35 assertions**, все PASS.

## §20 Regression run

**Frontend `node --test tests/frontend/*.mjs`:**
- 354 tests total
- **344 PASS**
- 10 FAIL — **pre-existing**, не связаны с этой работой:
  - test_chat_text_delivery_outbox
  - test_currency_normalization
  - test_deal_deeplink_guard_runtime
  - test_gps_offline_queue
  - test_loser_deal_deeplink_access
  - test_outbox_user_ownership
  - test_social_auth_callback_buffer
  - test_social_auth_retry
  - test_storage_remove_by_prefix
  - test_web_location_settings_recovery

**Backend `pytest`:**
- pre-existing DB init issues (`no such table` errors) — **не связаны**
  с этой сессией. Не трогал backend, кроме iOS push commit (прошлый turn).

## §21 Physical Xiaomi — НЕ ПРОВЕДЕН

Я не могу физически установить APK на устройство `BUA6JB99T465Q49X` из
изолированного контейнера. Оставлено **OWNER MANUAL TEST**:

- [ ] Установить новую QA build с ветки `claude/recovery-audit-20260902`
- [ ] Deals: единый список, нет `Предложения / В работе / Архив`
- [ ] Chat: `#EFEAE2` фон, `#D9FDD3` outgoing, `#FFFFFF` incoming
- [ ] Кнопка «Перевести» видна (зелёная с underline)
- [ ] Composer над клавиатурой (не под)
- [ ] Voice: play → работает, второе voice → останавливает первое,
      нет ложного «Не удалось воспроизвести»
- [ ] Отправка `100%`, `%20`, emoji 👋, URL с `%2520` — сохраняется 1:1

## §22 iPhone — НЕ ПРОВЕДЕН

То же для физического iPhone 15 Pro Max. Плюс:

- [ ] После загрузки APNs `.p8` в EAS: push foreground / background /
      lock / kill — доставляется
- [ ] Sound `default` играет
- [ ] Badge обновляется, при чтении сбрасывается
- [ ] Tap на push → правильный chat

## Release verdict

**Оценка:** **BLOCKED** (частично)

**Что PASS без физической проверки (архитектура + code + tests + docs):**
- §1 Git archaeology ✅
- §2/§3 Deals unified inbox ✅
- §5 Chat colors freeze ✅
- §6 «Показать перевод» visibility ✅
- §7 %20 encoding contract ✅
- §8 Voice _playResolve ✅
- §9 Voice false toast ✅
- §10 Keyboard/composer ✅
- §11 Back navigation ✅
- §15 Legacy paths mapped ✅
- §16/§17 Canon docs ✅
- §18/§19 Contract tests ✅
- §20 Automated regression ✅

**Что BLOCKED:**
- §12/§13 iPhone push — **owner должен загрузить APNs `.p8`** в EAS
- §21 Xiaomi — физическая проверка
- §22 iPhone — физическая проверка

**Не сделано:**
- §4 Полная унификация Android/iOS chat implementation — требует
  физического наблюдения разъездов между устройствами. Утверждённый
  canonical implementation остаётся `DealWorkspaceScreenV2`.

## Что дальше

1. Просмотр PR `claude/recovery-audit-20260902` — human review
2. Физический QA на Xiaomi по чеклисту §21
3. Owner action: APNs .p8 в EAS
4. Физический QA на iPhone по чеклисту §22
5. Только после этого — release verdict PASS
