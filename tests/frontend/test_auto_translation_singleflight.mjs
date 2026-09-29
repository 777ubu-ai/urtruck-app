import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const voiceState = readFileSync('src/utils/voiceTranscriptState.js', 'utf8');

test('перевод текста не ставится в очередь при загрузке или polling', () => {
  assert.doesNotMatch(source, /autoTranslationRef|autoTranslate|toggleAutoTranslate/);
  assert.doesNotMatch(source, /messages\.filter\([\s\S]{0,500}chatAPI\.translate/);
  assert.match(source, /onPress=\{\(\) => textTranslation\.translate\(item\.id\)\}/);
});

test('оригинал текста всегда остаётся в пузыре, перевод рисуется отдельно', () => {
  assert.match(source, /\{item\.text\}/);
  assert.match(source, /testID="deal-chat-message-translation"[\s\S]{0,180}\{messageTranslation\.translation\.text\}/);
  assert.match(source, /!item\.mine && !item\.system && \(!inferChatTextLanguage\(item\.text\) \|\| inferChatTextLanguage\(item\.text\) !== lang\.toLowerCase\(\)\)/);
});

test('экран использует state-machine ручного перевода, а ошибка оставляет Retry', () => {
  assert.match(source, /createManualTextTranslationState/);
  assert.match(source, /messageTranslation\.error \? t\('repeat_action'\) : t\('translate'\)/);
  assert.match(source, /testID="deal-chat-translation-error"/);
  assert.match(source, /textTranslation\.hydrate\(\)/);
});

test('экран создаёт отдельный text state для room/user/language scope', () => {
  assert.match(source, /const translationScope = JSON\.stringify\(\[roomId, session\?\.user\?\.id \|\| null, lang\.toLowerCase\(\)\]\)/);
  assert.match(source, /createManualTextTranslationState\(chatAPI, storage, \{/);
  assert.match(source, /\}\), \[translationScope\]\);/);
});

test('кэш приватного текста гидратируется без AI', () => {
  assert.match(source, /textTranslation\.hydrate\(\)/);
  assert.doesNotMatch(source, /autoTranslationRef|autoTranslate|toggleAutoTranslate/);
});

test('голос не выполняет скрытый STT или перевод после отправки и polling', () => {
  assert.doesNotMatch(source, /voiceText\.prewarm|voiceText\.ensureVisible/);
  assert.doesNotMatch(voiceState, /\bprewarm\(|\bensureVisible\(/);
  assert.match(source, /onToggleTranscript=\{\(\) => toggleVoiceTranscript\(item\)\}/);
});

test('push отправляется из сохранённого original до любых переводов', () => {
  const backend = readFileSync('backend/api/chat.py', 'utf8');
  const sendStart = backend.indexOf('def send_message(');
  const translateStart = backend.indexOf('def translate_message(');
  const sendSource = backend.slice(sendStart, translateStart);
  assert.match(sendSource, /send_to_user\([\s\S]*?preview,/);
  assert.doesNotMatch(sendSource, /translate_text\(/);
});
