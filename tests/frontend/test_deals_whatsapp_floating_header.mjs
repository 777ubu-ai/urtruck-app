// P0 2026-09-03 — canon CORRECTION (owner-verified, физический тест на
// Android 15 + Android 16). См. docs/product/DEALS_CANON.md.
//
// Владелец физически проверил обе версии и явно назвал unified-inbox
// (Все/Непрочитанные внутри Deals) регрессией — приказал вернуть 3
// канонические вкладки Предложения / В работе / Архив (введены в
// e036e53, PR #243, ранее ошибочно объявленные регрессией в 1063c6b5
// без живого подтверждения владельца).
//
//   - ChatsListScreen router: route.name === 'Deals' → DealsScreen,
//     иначе → ChatsListLegacyScreen (Все/Непрочитанные — там, для
//     отдельного не-Deals экрана списка чатов).
//   - DealsScreen имеет deals-tab-offers/active/archive.
//   - Плавающий header остаётся — с 3 вкладками (не 2).
//   - ARCHIVE_DEAL_STATUSES остаются свойством карточек (isArchived → dimmed)
//     ВНУТРИ вкладки "В работе"/общего списка — это не противоречит
//     наличию отдельной вкладки "Архив".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wrapper = fs.readFileSync("src/screens/ChatsListScreen.js", "utf8");
const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");

test("ChatsListScreen router: Deals → DealsScreen, иначе → ChatsListLegacyScreen", () => {
  assert.match(wrapper, /route\??\.name\s*===\s*['"]Deals['"]/,
    'условное ветвление обязательно — Deals и chat-list это разные экраны');
  assert.match(wrapper, /<DealsScreen \{\.\.\.props\} ?\/>/);
  assert.match(wrapper, /import\s+LegacyChatsListScreen from ['"]\.\/ChatsListLegacyScreen['"]/,
    'ChatsListLegacyScreen подключён — отдельный канонический экран для Все/Непрочитанные');
});

test('deal inbox: floating header с каноническими 3 вкладками (Предложения/В работе/Архив)', () => {
  assert.match(deals, /testID="deals-minimal-header"/,
    'плавающий header (menu + tabs + search)');
  assert.match(deals, /testID="deals-primary-tabs"/,
    'блок tab-переключателей');
  assert.match(deals, /testID="deals-tab-offers"/, 'вкладка Предложения');
  assert.match(deals, /testID="deals-tab-active"/, 'вкладка В работе');
  assert.match(deals, /testID="deals-tab-archive"/, 'вкладка Архив');
  // Инверсная защита: unified-inbox 2 вкладки — отклонённая владельцем регрессия.
  assert.doesNotMatch(deals, /testID="deals-tab-all"/);
  assert.doesNotMatch(deals, /testID="deals-tab-unread"/);
});

test("archive-статус доступен как свойство карточки (isArchived → dimmed) внутри общего списка", () => {
  // ARCHIVE_DEAL_STATUSES = {completed, cancelled, rejected, expired}
  assert.match(deals, /ARCHIVE_DEAL_STATUSES = new Set\(\[[^\]]*completed[^\]]*\]/);
  assert.match(deals, /const isArchived = ARCHIVE_DEAL_STATUSES\.has\(data\.status\)/);
  assert.match(deals, /dimmed=\{isArchived\}/);
});
