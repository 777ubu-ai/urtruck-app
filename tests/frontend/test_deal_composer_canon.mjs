import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const composerStart = source.indexOf('testID="deal-chat-composer"');
const composerEnd = source.indexOf('testID="deal-chat-emoji-menu"', composerStart);
const composer = source.slice(composerStart, composerEnd);

test('deal chat composer keeps the canonical control order [+][input+emoji][mic][Send]', () => {
  assert.ok(composerStart >= 0, 'composer must exist');
  assert.ok(composerEnd > composerStart, 'composer must end before emoji menu');

  const plus = composer.indexOf('testID="deal-chat-attach"');
  const inputShell = composer.indexOf('testID="deal-chat-input-shell"');
  const emoji = composer.indexOf('testID="deal-chat-emoji"');
  const microphone = composer.indexOf('testID="deal-chat-voice"');
  const send = composer.indexOf('testID="deal-chat-send"');

  assert.ok(plus >= 0 && plus < inputShell, 'plus must be first (left)');
  assert.ok(inputShell < send, 'input shell before send');
  assert.ok(inputShell < microphone, 'microphone must be outside and after input');
  // emoji живёт ВНУТРИ inputShell справа
  assert.ok(emoji > inputShell && emoji < send, 'emoji must be inside the input shell');
  assert.ok(emoji > composer.indexOf('testID="deal-chat-input"'), 'emoji sits after the TextInput inside the shell');
});

test('no standalone camera control occupies the composer row', () => {
  assert.equal(composer.indexOf('testID="deal-chat-camera"'), -1, 'camera must not be a permanent composer control');
  // камера остаётся доступной — через attachment menu
  assert.match(source, /testID:\s*'deal-chat-attach-camera'/);
});

test('composer placeholder is localized and role-aware', () => {
  assert.match(composer, /placeholder=\{isDriver \? ui\.writeShipper : ui\.write\}/);
  assert.doesNotMatch(composer, /placeholder=""/, 'empty placeholder is forbidden');
});

test('mic and send are not confused: mic for empty input, send for text', () => {
  assert.match(composer, /input\.trim\(\) \? \(/);
  assert.match(composer, /name="mic"/, 'mic icon for voice action');
  assert.match(composer, /name="paper-plane"/, 'send icon for send action');
});
