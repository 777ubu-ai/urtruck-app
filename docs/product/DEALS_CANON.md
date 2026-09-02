# DEALS canon (P0 freeze 2026-09-02)

**Владелец подтвердил** после регрессии PR #243 (e036e53) «WhatsApp-style
floating deal inbox», которая тайно вернула старые вкладки «Предложения /
В работе / Архив».

## Канон

- `Deals` = ЕДИНЫЙ inbox — один общий список.
- Наверху экрана:
  - поиск;
  - **максимум** 2 фильтра: `Все` / `Непрочитанные`.
- Далее единый список по свежести (last_message_at → updated_at → created_at)
  с приоритетом attention (unread_count, tracking_action_required).
- Каждая карточка самостоятельно показывает свой статус:
  - Предложение;
  - Принят;
  - В пути;
  - Граница;
  - Ожидает подтверждения;
  - Доставлен;
  - Завершён;
  - Отменён;
  - Истёк.
- Архивные (`ARCHIVE_DEAL_STATUSES`) остаются в общем списке визуально
  приглушёнными (`dimmed`), а не выносятся во вкладку.
- Один и тот же экран для web / iOS / Android / bottom tab / deep link /
  push navigation. Никаких Legacy-веток.

## Запрещённые regressions

- Возврат вкладок `deals-tab-active` / `deals-tab-archive` / `deals-tab-offers`.
- Возврат подписей `tabActiveLabel` / `tabArchiveLabel` / `tabOffersLabel`
  в `COPY`.
- Возврат `dealTab === 'active'` / `'archive'` / `'offers'` в UI-логике.
- Подключение `ChatsListLegacyScreen.js` из `ChatsListScreen.js` роутера.

CI-инвариант — `tests/frontend/test_deals_unified_inbox_contract.mjs`.

## История регрессии

| SHA | Дата | Смысл |
|---|---|---|
| `0b2c11e` | 2026-08-04 | refactor: replace deal tabs with unified inbox — **правильный канон** |
| `d730aaa` | 2026-08-04 | fix: remove deal duplication from work screens |
| `e036e53` | 2026-08-19 | feat(deals): WhatsApp-style floating deal inbox — **тайно вернул 3 вкладки** |
| `379f7b1` | 2026-08-19 | Merge PR #243 — регрессия слита в main |

Любая новая модификация экрана `Deals` проходит через
`tests/frontend/test_deals_unified_inbox_contract.mjs` и review этого файла.
