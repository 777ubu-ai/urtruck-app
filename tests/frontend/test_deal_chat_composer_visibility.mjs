// Регрессия P0-hotfix TestFlight 1.0.7 build18 (28.08.2026), §6.
//
// Баг: «Нижняя строка ввода сообщения в чате иногда пропадает». Root cause:
// FlatList сообщений сворачивал composer до тонкой ручки-хэндла на обычный
// скролл истории. Для build 18 правило стало проще и надёжнее: composer
// вообще не имеет collapsed-режима и всегда остаётся видимым.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_deal_chat_composer_visibility.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('composer: collapsed-режим полностью убран из чата сделки', () => {
  assert.doesNotMatch(src, /composerCollapsed/);
  assert.doesNotMatch(src, /setComposerCollapsed/);
  assert.doesNotMatch(src, /deal-chat-composer-collapsed/);
  assert.doesNotMatch(src, /composerCollapsedHandle/);
  assert.doesNotMatch(src, /onScrollBeginDrag=\{collapseComposer\}/);
  assert.match(src, /testID="deal-chat-composer"/);
  assert.match(src, /testID="deal-chat-input"/);
});
