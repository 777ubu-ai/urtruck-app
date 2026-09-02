// P0 2026-09-02 — переписан под unified inbox (§2/§3).
//
// БЫВШИЙ файл (`e036e53 PR #243 «WhatsApp-style floating deal inbox»`)
// защищал именно ту регрессию, которая вернула вкладки Предложения / В
// работе / Архив. Теперь тест защищает НОВЫЙ канон:
//
//   - ChatsListScreen router ВСЕГДА возвращает DealsScreen (без Legacy).
//   - DealsScreen имеет `deals-tab-all` / `deals-tab-unread`, не старые
//     `deals-tab-offers/active/archive`.
//   - Плавающий header остаётся — но без 3 вкладок.
//   - ARCHIVE_DEAL_STATUSES остаются свойством карточек (isArchived → dimmed),
//     не отдельной вкладкой.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wrapper = fs.readFileSync("src/screens/ChatsListScreen.js", "utf8");
const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");

test("ChatsListScreen router возвращает DealsScreen для любого маршрута", () => {
  assert.match(wrapper, /<DealsScreen \{\.\.\.props\} ?\/>/);
  assert.doesNotMatch(wrapper, /^import\s+.*LegacyChatsListScreen/m,
    "Legacy path устарел (см. DEALS_CANON.md)");
});

test('deal inbox: floating header остаётся, но с новыми canonical вкладками', () => {
  assert.match(deals, /testID="deals-minimal-header"/,
    'плавающий header (menu + tabs + search)');
  assert.match(deals, /testID="deals-primary-tabs"/,
    'блок tab-переключателей — 2 канонических chips');
  assert.match(deals, /testID="deals-tab-all"/, 'вкладка Все');
  assert.match(deals, /testID="deals-tab-unread"/, 'вкладка Непрочитанные');
  assert.match(deals, /testID="deals-scroll-header"/,
    'search живёт внутри listHeader');
  // Инверсная защита: старые вкладки — регрессия.
  assert.doesNotMatch(deals, /testID="deals-tab-offers"/);
  assert.doesNotMatch(deals, /testID="deals-tab-active"/);
  assert.doesNotMatch(deals, /testID="deals-tab-archive"/);
});

test("archive-статус — свойство карточки (isArchived → dimmed), а не вкладка", () => {
  // ARCHIVE_DEAL_STATUSES = {completed, cancelled, rejected, expired}
  assert.match(deals, /ARCHIVE_DEAL_STATUSES = new Set\(\[[^\]]*completed[^\]]*\]/);
  // isArchived → dimmed prop на карточке
  assert.match(deals, /const isArchived = ARCHIVE_DEAL_STATUSES\.has\(data\.status\)/);
  assert.match(deals, /dimmed=\{isArchived\}/);
  // baseItems: closedBidsData участвует в едином списке
  assert.match(deals, /closedBidsData/);
});
