// P1 regression matrix for the native multiline deal-chat composer.
// The device-only keyboard/focus assertions remain part of the physical QA
// gate; these tests lock the pure height contract and the stable view shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeComposerHeight } from '../../src/utils/chatMessageListState.js';

const MIN = 44;
const MAX = 104;
const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('composer height regression matrix: typing, paste, delete and long text', () => {
  const cases = [
    ['1 строка', 'Привет', 20, 44],
    ['2 строки', 'Привет\nкак дела?', 40, 48],
    ['4 строки', '1\n2\n3\n4', 80, 88],
    ['длинный текст', 'x'.repeat(500), 180, 104],
    ['вставка большого текста', 'x'.repeat(5000), 900, 104],
    ['удаление текста', '', 900, 44],
  ];
  for (const [name, input, measured, expected] of cases) {
    assert.equal(
      normalizeComposerHeight(input, measured, MIN, MAX, 8),
      expected,
      name,
    );
  }
});

test('composer ignores invalid native measurements and preserves a stable focusable input', () => {
  for (const measured of [null, undefined, NaN, -1, -100]) {
    assert.equal(normalizeComposerHeight('draft', measured, MIN, MAX, 8), null);
  }
  assert.match(workspace, /const reportedHeight = event\?\.nativeEvent\?\.contentSize\?\.height/);
  assert.doesNotMatch(workspace, /event\.nativeEvent\.contentSize\.height/);
  assert.match(workspace, /inputValueRef\.current = value/);
  assert.match(workspace, /inputValueRef\.current = next/);
  assert.match(workspace, /if \(inputHeightRef\.current === next\) return/);
  assert.doesNotMatch(workspace, /<TextInput[\s\S]{0,600}key=/);
  assert.doesNotMatch(workspace, /testID="deal-chat-composer-dock"[\s\S]{0,2600}onLayout=/);
});

test('keyboard/background/foreground/rotation use one KAV and no parent height feedback loop', () => {
  assert.match(workspace, /<KeyboardAvoidingView style=\{s\.safe\} behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  assert.match(workspace, /useKeyboardDockInset\(window\.height\)/);
  assert.match(workspace, /keyboardWillShow|keyboardDidShow/);
  assert.match(workspace, /keyboardWillHide|keyboardDidHide/);
  assert.doesNotMatch(workspace, /testID="deal-chat-composer-dock"[\s\S]{0,2600}onLayout=\{[^}]*height/);
});
