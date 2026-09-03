# DEALS canon (P0 freeze 2026-09-03 — CORRECTED)

**Владелец физически проверил** на Android 15 (4PYDDI4DHIXS5DD6) и
Android 16 (BUA6JB99T465Q49X) и явно назвал unified-inbox (`Все` /
`Непрочитанные` внутри Deals) регрессией — приказал вернуть 3 вкладки.

> Эта версия отменяет предыдущий freeze от 2026-09-02 (коммит `1063c6b5`),
> который сам объявил 3-вкладочный экран регрессией со ссылкой на
> «подтверждение владельца» без живого диалога в моменте. Текущая прямая
> команда владельца (2026-09-02, вечер) имеет приоритет над git history:
> «Git history не имеет права автоматически отменять более новую
> продуктовую договорённость».

## Канон

- `Deals` (bottom-tab) = **Предложения / В работе / Архив** — три вкладки
  со счётчиками (`deals-tab-offers` / `deals-tab-active` / `deals-tab-archive`).
- `dealTab` по умолчанию — `'offers'`.
- `Все` / `Непрочитанные` — ТОЛЬКО для отдельного, НЕ-Deals экрана списка
  чатов (`ChatsListLegacyScreen`, `route.name !== 'Deals'`, deep link /
  standalone `ChatsList` route). Это отдельный утверждённый фильтр
  сообщений, не подмена основного Deals UI.
- `ChatsListScreen.js` — роутер: `route.name === 'Deals' ? DealsScreen :
  ChatsListLegacyScreen`. Оба компонента живы и подключены.

## Запрещённые regressions

- Полная замена 3 вкладок Deals (`deals-tab-offers/active/archive`) на
  `Все`/`Непрочитанные` внутри самого Deals-экрана.
- Удаление условного роутинга в `ChatsListScreen.js` (принудительный
  единый компонент для всех `route.name`).
- Изменение дефолта `dealTab` с `'offers'` на что-либо другое без
  отдельного разрешения владельца.

CI-инвариант — `tests/frontend/test_deals_unified_inbox_contract.mjs`.

## История (для контекста, НЕ источник истины)

| SHA | Дата | Смысл |
|---|---|---|
| `0b2c11e` | 2026-08-04 | refactor: replace deal tabs with unified inbox |
| `e036e53` | 2026-08-19 | feat(deals): WhatsApp-style floating deal inbox — вернул 3 вкладки |
| `1063c6b5` | 2026-09-02 | recovery-audit — откатил обратно на unified inbox, сославшись на неподтверждённое «владелец подтвердил» |
| `731ac1ba` | 2026-09-02 | **owner-verified fix** — физически проверено на 2 Android, откат к 3 вкладкам по прямой команде |

Git history above — это хронология, не источник истины. Источник истины —
текущая прямая команда владельца (см. заголовок файла) и
`tests/frontend/test_deals_unified_inbox_contract.mjs`.

Любая новая модификация экрана `Deals` проходит через этот тест и review
этого файла. Изменение канона обратно на unified-inbox требует отдельного
явного разрешения владельца в моменте, а не ссылки на старый git-коммит.
