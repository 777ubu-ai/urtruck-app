// P0 2026-09-02 — §2/§3 Deals canonical unified inbox contract.
//
// Root cause регрессии (доказан через Git archaeology):
//   0b2c11e (2026-08-04): canonical unified inbox (правильно)
//   e036e53 (2026-08-19, PR #243): "WhatsApp-style floating deal inbox" —
//     ВЕРНУЛ старые вкладки Предложения/В работе/Архив под маркетинговым
//     названием (регрессия).
//
// Канон (владелец подтвердил 2026-09-02):
//   единый inbox
//   поиск
//   максимум Все / Непрочитанные
//   статус на карточке (accepted, in_progress, delivered, cancelled, expired…)
//   нет верхних вкладок "В работе" / "Архив" / "Предложения"
//
// Инверсная regression-защита: если кто-то снова введёт эти три вкладки,
// CI падает.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');

test('DealsScreen НЕ содержит старые testID `deals-tab-offers/active/archive`', () => {
  assert.doesNotMatch(deals, /testID=["']deals-tab-offers["']/,
    'вкладка Предложения — регрессия PR #243');
  assert.doesNotMatch(deals, /testID=["']deals-tab-active["']/,
    'вкладка В работе — регрессия PR #243');
  assert.doesNotMatch(deals, /testID=["']deals-tab-archive["']/,
    'вкладка Архив — регрессия PR #243');
});

test('DealsScreen содержит НОВЫЕ канонические testID `deals-tab-all/unread`', () => {
  assert.match(deals, /testID=["']deals-tab-all["']/,
    'вкладка Все — канон unified inbox');
  assert.match(deals, /testID=["']deals-tab-unread["']/,
    'вкладка Непрочитанные — второй фильтр');
});

test('DealsScreen НЕ содержит русскую подпись «В работе» / «Архив» / «Предложения» в labels', () => {
  // Оставляем в comment/description — там просто описание. А в UI labels — нет.
  // Ищем именно tabActiveLabel/tabArchiveLabel/tabOffersLabel как ключи в COPY
  assert.doesNotMatch(deals, /^\s+tabOffersLabel:/m, 'copy key tabOffersLabel не должен быть');
  assert.doesNotMatch(deals, /^\s+tabActiveLabel:/m);
  assert.doesNotMatch(deals, /^\s+tabArchiveLabel:/m);
});

test('DealsScreen содержит новые label keys tabAllLabel/tabUnreadLabel', () => {
  assert.match(deals, /^\s+tabAllLabel:/m);
  assert.match(deals, /^\s+tabUnreadLabel:/m);
});

test('default dealTab = "all", а не "offers"', () => {
  assert.match(deals, /useState\(\s*["']all["']\s*\)/,
    'дефолт единого inbox: `all`');
  assert.doesNotMatch(deals, /useState\(\s*["']offers["']\s*\)/,
    'старый дефолт `offers` — регрессия');
});

test('baseItems объединяет offers + active + archived + closed в один список', () => {
  // Наличие всех четырёх source arrays в merged
  assert.match(deals, /const merged = \[[\s\S]*?offersData[\s\S]*?activeDeals[\s\S]*?archivedDeals[\s\S]*?closedBidsData/,
    'merged объединяет все 4 источника');
});

test('archive-состояние — свойство карточки (isArchived → dimmed), не вкладка', () => {
  assert.match(deals, /const isArchived = ARCHIVE_DEAL_STATUSES\.has\(data\.status\)/,
    'isArchived вычисляется из data.status, не из dealTab');
  assert.match(deals, /dimmed=\{isArchived\}/,
    'dimmed=isArchived — визуальный маркер архива на карточке');
});

test('inverse regression: dealTab === "active"/"archive"/"offers" НЕ используется в UI-логике', () => {
  const matches = deals.match(/dealTab === ["'](active|archive|offers)["']/g) || [];
  assert.equal(matches.length, 0,
    `не должно быть сравнений с "active"/"archive"/"offers" (найдено ${matches.length}): ${matches}`);
});

test('§15: ChatsListScreen НЕ импортирует LegacyChatsListScreen (регрессировавший path)', () => {
  const router = readFileSync('src/screens/ChatsListScreen.js', 'utf8');
  assert.doesNotMatch(router, /import\s+.*ChatsListLegacyScreen/,
    'LegacyChatsListScreen — устаревший path со старыми вкладками, не подключаем');
  assert.match(router, /import\s+DealsScreen/,
    'единый источник Deals inbox — DealsScreen');
});

test('§15: ChatsListScreen router возвращает DealsScreen для ЛЮБОГО route.name', () => {
  const router = readFileSync('src/screens/ChatsListScreen.js', 'utf8');
  // Не должно быть условного `route.name === 'Deals' ? ... : LegacyChatsList`
  assert.doesNotMatch(router, /route\.name\s*===\s*['"]Deals['"]\s*\?/,
    'условное разветвление ChatsList/Deals — регрессия');
});
