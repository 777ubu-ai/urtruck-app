// P0 2026-09-02 (Phase 2 §8) — регрессия проверки: отключение
// LegacyChatsListScreen из ChatsListScreen роутера НЕ должно сломать
// deep-link/standalone/push navigation.
//
// Пути:
//   1. Bottom-tab «Deals» → ChatsListScreen → DealsScreen (unified inbox) ✅
//   2. Stack route "ChatsList" (используется в NotificationsScreen и др.
//      как fallback) → ChatsListScreen → DealsScreen ✅
//   3. `navigate('Chat', {...})` — открывает отдельный ChatScreenV2, не
//      ChatsList; поэтому Legacy для этого пути не задействован
//   4. Deep link urtruck://deals/{id} → dealLinkGuard → workspace/chat, не
//      ChatsList; поэтому Legacy для этого пути не задействован
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const router = readFileSync('src/screens/ChatsListScreen.js', 'utf8');

test('Bottom-tab "Deals" mount ChatsListScreen (roving DealsScreen под ним)', () => {
  assert.match(nav, /Tab\.Screen\s+name="Deals"\s+component=\{ChatsListScreen\}/);
});

test('Stack route "ChatsList" остался — deep-link и standalone работают', () => {
  assert.match(nav, /Stack\.Screen\s+name="ChatsList"\s+component=\{ChatsListScreen\}/);
});

test('ChatsListScreen роутер всегда возвращает DealsScreen (безусловно, для любого route.name)', () => {
  assert.match(router, /return <DealsScreen \{\.\.\.props\} ?\/>/);
  // Никаких условных ветвлений route.name === 'Deals'
  assert.doesNotMatch(router, /route\.name\s*===\s*['"]Deals['"]\s*\?/);
});

test('navigate("Chat", ...) — отдельный экран ChatScreenV2, не ChatsList', () => {
  // Chat mount в Stack — отдельно от ChatsList
  assert.match(nav, /Stack\.Screen\s+name="Chat"\s+component=\{ChatScreenV2\}/);
  // ChatScreenV2 — единственный target для navigate('Chat', ...)
  const chatScreenImports = nav.match(/import\s+ChatScreenV2/g) || [];
  assert.ok(chatScreenImports.length >= 1, 'ChatScreenV2 импортируется');
});

test('LegacyChatsListScreen не подключён нигде в navigation', () => {
  assert.doesNotMatch(nav, /LegacyChatsListScreen|ChatsListLegacyScreen/,
    'AppNavigator не должен импортировать/монтировать Legacy');
});

test('DealsScreen imported by ChatsListScreen router, единый источник', () => {
  assert.match(router, /^import DealsScreen from ['"]\.\/DealsScreen['"];?/m);
});
