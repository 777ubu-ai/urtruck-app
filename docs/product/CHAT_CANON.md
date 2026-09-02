# CHAT canon (P0 freeze 2026-09-02)

**Владелец подтвердил** после физического аудита разъезда Android/iOS.
Экран владелец использует — `DealWorkspaceScreenV2` (deal chat lane).

## Цветовая палитра — FREEZE

```
Chat background:       #EFEAE2   (WhatsApp beige — канон)
Outgoing bubble:       #D9FDD3
Incoming bubble:       #FFFFFF
Primary text:          #111B21
Time / secondary:      #667781
Composer:              #FFFFFF
Secondary controls:    #54656F
```

Тёмный насыщенный зелёный (`#168759`, `#34936B`, `#22C55E`, `#0F6B47`)
для исходящих сообщений **запрещён**. Изменение цветов — только через
отдельное решение владельца.

## Функциональный канон

- **Один канонический chat implementation** — `DealWorkspaceScreenV2`. Никакой
  platform divergence (Android/iOS должны показывать одинаковое поведение).
- **Composer над клавиатурой**: `KeyboardAvoidingView` с
  `behavior='padding'` (iOS) / `behavior='height'` (Android). **НЕ**
  `behavior=undefined`.
- **Показать перевод** — кнопка на каждом текстовом сообщении не-my. Цвет
  `#168759` (brand accent, 4.52:1 vs белого — WCAG AA) с
  `textDecorationLine: 'underline'`. Не `theme.textMuted`, не `#667781`.
- **Voice**: одновременно играет ТОЛЬКО одно сообщение. Ошибочный тост
  «Не удалось воспроизвести» появляется **только** после terminal failure
  (native throw в try/catch, реальный error). Не на transitional/pause.
- **`voiceRecorder._playResolve`**: объявлена на module scope с
  `let _playResolve = null;`. Отсутствие объявления = ReferenceError в
  play().
- **Текст сообщения**: НИКТО в chat-пути не применяет `encodeURIComponent`
  к user text. НИКТО не применяет `decodeURIComponent` к пришедшему text
  (иначе `100%` даст URIError, `%20` даст ` `).

## Contract tests (freeze regression)

- `tests/frontend/test_chat_canonical_colors_freeze.mjs` — палитра
- `tests/frontend/test_chat_translation_button_visible.mjs` — «Перевести»
- `tests/frontend/test_chat_keyboard_avoiding_contract.mjs` — KAV
- `tests/frontend/test_voice_playresolve_declared.mjs` — voice lifecycle
- `tests/frontend/test_chat_message_encoding_contract.mjs` — %20 бага

Любая новая модификация чата проходит через эти contract tests и review
этого файла.
