import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/ChatScreen.js', 'utf8');
const composerStart = source.indexOf('<View style={s.inputRow}>');
const composerEnd = source.indexOf('{showAttach && (', composerStart);
const composer = source.slice(composerStart, composerEnd);

test('legacy chat composer keeps the canonical control order', () => {
  assert.ok(composerStart >= 0, 'composer row must exist');
  assert.ok(composerEnd > composerStart, 'composer must end before attachment menu');

  const plus = composer.indexOf('testID="chat-attach-btn"');
  const inputShell = composer.indexOf('testID="chat-input-shell"');
  const emoji = composer.indexOf('testID="chat-emoji-btn"');
  const microphone = composer.indexOf('testID="chat-voice-btn"');
  const send = composer.indexOf('testID="chat-send-btn"');

  assert.ok(plus < inputShell, 'plus must be first');
  assert.ok(inputShell < microphone, 'microphone must be outside and after input');
  assert.ok(microphone < send, 'send must be the far-right action');
  assert.match(composer.slice(inputShell, microphone), /testID="chat-emoji-btn"/);
  assert.match(composer, /<View style=\{s\.inputShell\} testID="chat-input-shell">/);
  assert.doesNotMatch(composer, /name="camera"/);
});

test('composer controls expose touch targets and accessibility semantics', () => {
  assert.match(source, /iconBtn:\s*\{[\s\S]*?width: 44,[\s\S]*?height: 44,/);
  assert.match(source, /sendBtn:\s*\{[\s\S]*?width: 44,[\s\S]*?height: 44,/);
  assert.match(source, /emojiBtn:\s*\{[\s\S]*?width: 44,[\s\S]*?height: 44,/);
  assert.match(source, /fontSize: 16,\n\s+borderWidth: 0,/);
  assert.match(composer, /testID="chat-attach-btn"[\s\S]*?accessibilityRole="button"/);
  assert.match(composer, /testID="chat-emoji-btn"[\s\S]*?accessibilityRole="button"/);
  assert.match(composer, /testID="chat-voice-btn"[\s\S]*?accessibilityRole="button"/);
  assert.match(composer, /testID="chat-send-btn"[\s\S]*?accessibilityRole="button"/);
});

test('emoji picker inserts text without changing message transport', () => {
  assert.match(source, /const insertEmoji = \(emoji\) =>/);
  assert.match(source, /setInput\(\(value\) => `\$\{value\}\$\{emoji\}`\)/);
  assert.match(source, /testID="chat-emoji-panel"/);
  assert.match(source, /testID=\{`chat-emoji-option-\$\{index\}`\}/);
  assert.match(source, /onPress=\{\(\) => sendMessage\(\)\}/);
});
