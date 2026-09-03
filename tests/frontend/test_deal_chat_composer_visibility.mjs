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

test('composer: поле ввода визуально видно даже когда оно пустое', () => {
  // P0 2026-09-03 (owner fix, физически подтверждено на Android 15/16):
  // родной TextInput placeholder на Android игнорирует numberOfLines в
  // multiline-режиме — длинный текст ("Написать грузоотправителю…")
  // переносился на 2 строки и обрезался нижней границей composer'а.
  // Заменён на кастомный <Text numberOfLines={1}> поверх поля, видимый
  // только когда !input — так placeholder гарантированно однострочный,
  // но остаётся видимым, пока поле пустое (исходный смысл теста).
  assert.doesNotMatch(src, /placeholder=""/);
  assert.doesNotMatch(src, /placeholderTextColor="transparent"/);
  assert.doesNotMatch(src, /placeholder=\{isDriver \? ui\.writeShipper : ui\.write\}/,
    'нативный TextInput placeholder убран — переехал в кастомный Text overlay');
  assert.match(src, /\{!input \? \(\s*<Text[\s\S]{0,200}?numberOfLines=\{1\}/,
    'кастомный placeholder Text должен рендериться только когда !input (видим, пока пусто)');
  assert.match(src, /\{isDriver \? ui\.writeShipper : ui\.write\}\s*<\/Text>/,
    'кастомный placeholder должен использовать те же тексты, что и раньше');
  assert.match(src, /const isCompactComposer = window\.width < 390/);
  assert.match(src, /!\s*composerFocused && !isCompactComposer \? \(/);
  assert.match(src, /inputShell: \{ flex: 1, minHeight: 32, maxHeight: 74, minWidth: 96/);
  // P0 (owner fix): inputShell больше НЕ рисует свою капсулу (border/bg)
  // поверх уже белой капсулы composer — это и была двойная рамка,
  // физически подтверждённая и исправленная. borderWidth/borderColor
  // теперь принадлежат только внешнему composer.
  const inputShellLine = src.match(/^ *inputShell: \{[^}]*\},?$/m);
  assert.ok(inputShellLine, 'строка стиля inputShell должна существовать');
  assert.doesNotMatch(inputShellLine[0], /borderWidth/,
    'двойная рамка (inputShell со своим border) не должна вернуться');
});
