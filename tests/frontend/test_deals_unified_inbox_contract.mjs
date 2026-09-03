// P0 2026-09-03 — Deals canon CORRECTION (owner-verified, physical device).
//
// История:
//   0b2c11e (2026-08-04): unified inbox (Все/Непрочитанные)
//   e036e53 (2026-08-19, PR #243): вернул 3 вкладки Предложения/В работе/Архив
//   1063c6b5 (2026-09-02, автономная AI-сессия): откатил e036e53 обратно на
//     unified inbox, сославшись на «владелец подтвердил» в
//     docs/product/DEALS_CANON.md — БЕЗ живого подтверждения в моменте.
//   731ac1ba (2026-09-02, эта сессия): владелец физически проверил на
//     Android 15 (4PYDDI4DHIXS5DD6) и Android 16 (BUA6JB99T465Q49X),
//     явно назвал unified inbox регрессией и приказал вернуть 3 вкладки.
//
// Правило сессии (2026-09-03, ночной аудит): «Git history не имеет права
// автоматически отменять более новую продуктовую договорённость». Заявление
// коммита 1063c6b5 о «подтверждении владельца» не подкреплено текущим живым
// диалогом и противоречит явной последующей команде — текущая договорённость
// (3 вкладки) имеет приоритет.
//
// Канон (актуальный, физически подтверждён):
//   Deals = Предложения / В работе / Архив (с счётчиками на вкладках)
//   Все / Непрочитанные — ТОЛЬКО для отдельного, не-Deals экрана списка
//   чатов (route.name !== 'Deals', ChatsListLegacyScreen) — это отдельный
//   утверждённый фильтр уведомлений/сообщений, а не подмена Deals.
//
// Инверсная regression-защита: если кто-то снова полностью уберёт три
// вкладки Deals в пользу Все/Непрочитанные — CI должен упасть.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');
const router = readFileSync('src/screens/ChatsListScreen.js', 'utf8');

test('DealsScreen содержит канонические testID Предложения/В работе/Архив', () => {
  assert.match(deals, /testID=["']deals-tab-offers["']/, 'вкладка Предложения — канон');
  assert.match(deals, /testID=["']deals-tab-active["']/, 'вкладка В работе — канон');
  assert.match(deals, /testID=["']deals-tab-archive["']/, 'вкладка Архив — канон');
});

test('DealsScreen НЕ подменяет 3 вкладки на Все/Непрочитанные', () => {
  assert.doesNotMatch(deals, /testID=["']deals-tab-all["']/,
    'вкладка "Все" — регрессия unified-inbox, физически отклонена владельцем');
  assert.doesNotMatch(deals, /testID=["']deals-tab-unread["']/,
    'вкладка "Непрочитанные" внутри Deals — регрессия unified-inbox');
});

test('DealsScreen содержит канонические label keys (RU labels для вкладок)', () => {
  assert.match(deals, /^\s+tabOffersLabel:/m);
  assert.match(deals, /^\s+tabActiveLabel:/m);
  assert.match(deals, /^\s+tabArchiveLabel:/m);
});

test('default dealTab = "offers"', () => {
  assert.match(deals, /useState\(\s*["']offers["']\s*\)/,
    'дефолт — вкладка Предложения (канон)');
});

test('ChatsListScreen router: route.name === "Deals" → DealsScreen; иначе — отдельный список чатов', () => {
  // Канон: Deals (bottom-tab, 3 вкладки) и standalone chat-list (Все/Непрочитанные,
  // deep link / route.name !== 'Deals') — РАЗНЫЕ утверждённые экраны, не один
  // и тот же компонент для всех route. Условное ветвление обязательно.
  assert.match(router, /route\??\.name\s*===\s*['"]Deals['"]/,
    'router обязан различать route.name === Deals от остальных (chat-list) входов');
  assert.match(router, /import\s+DealsScreen/, 'Deals-таб рендерит DealsScreen');
});
