// DS-2026 regression: канон композера чата сделки.
//
// Канон (§6 FINAL PHYSICAL QA): [ + ] [ input + emoji внутри справа ] [ mic | Send ]
//
// История дефектов:
//  - D1 (P1, физический QA 08.09.2026): порядок был [камера][поле][emoji][🔊][+],
//    иконка «громкость» вместо микрофона, камера — отдельной кнопкой.
//
// Run: node tests/frontend/test_deal_chat_composer_canon.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

// Композер — от его testID до emoji-меню (не включая его).
const start = src.indexOf('testID="deal-chat-composer"');
const end = src.indexOf('testID="deal-chat-emoji-menu"', start);
assert.ok(start >= 0 && end > start, 'composer block must exist');
const composer = src.slice(start, end);

test('composer control order is [+] [input+emoji] [mic|send]', () => {
  const plus = composer.indexOf('testID="deal-chat-attach"');
  const input = composer.indexOf('testID="deal-chat-input"');
  const emoji = composer.indexOf('testID="deal-chat-emoji"');
  const voice = composer.indexOf('testID="deal-chat-voice"');
  const send = composer.indexOf('testID="deal-chat-send"');
  assert.ok(plus >= 0 && input > plus, 'plus must be the first control');
  assert.ok(emoji > input, 'emoji button must live after the input start');
  assert.ok(voice > emoji && send > emoji, 'mic/send must be the far-right action');
  // Камера не существует отдельной кнопкой — только внутри «+»-меню.
  assert.doesNotMatch(composer, /name="camera"/);
  assert.doesNotMatch(composer, /testID="deal-chat-camera"/);
  assert.match(src, /key: 'camera'.*onPress: sendCameraPhoto.*testID: 'deal-chat-attach-camera'/);
});

test('voice button uses a microphone icon, not a speaker', () => {
  assert.match(composer, /testID="deal-chat-voice"[\s\S]*?<Feather name="mic"/);
  assert.doesNotMatch(composer, /volume-2/);
});

test('composer controls meet the 44dp touch-target minimum', () => {
  assert.match(src, /composerCircle: \{ width: 44, height: 44,/);
  assert.match(src, /sendButton: \{ width: 44, height: 44,/);
});

test('input text is Body 16sp with room for the in-field emoji button', () => {
  assert.match(src, /input: \{[^}]*fontSize: 16,/);
  assert.match(src, /input: \{[^}]*paddingRight: 44,/);
  assert.match(src, /inputEmojiBtn: \{ position: 'absolute', right: 4,/);
});
