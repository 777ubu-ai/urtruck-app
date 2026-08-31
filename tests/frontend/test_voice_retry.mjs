// Регрессия P1 (release/reconcile-20260901 §3) — retry для упавшего
// голосового сообщения существовал визуально, но не работал.
//
// Баг: `item.sendStatus === 'failed' && item.voice` рендерил TouchableOpacity
// с `disabled` и БЕЗ `onPress` — тап физически ничего не делал, пользователь
// мог только записать голосовое заново (то есть создать ВТОРОЕ сообщение).
//
// Фикс: upload+send голосового вынесены в переиспользуемую sendVoiceMessage()
// — и первая попытка (toggleVoice), и retry (retryFailedVoice) вызывают её
// с ОДНИМ И ТЕМ ЖЕ clientId/client_msg_id, поэтому retry не создаёт новый
// пузырь и не может задвоить сообщение на сервере (backend дедупит по
// (sender_id, client_msg_id) — тот же контракт, что у текста).
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_voice_retry.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('sendVoiceMessage: переиспользуемая функция upload+send существует', () => {
  const idx = src.indexOf('const sendVoiceMessage = React.useCallback');
  assert.ok(idx > 0, 'sendVoiceMessage должна существовать как отдельная функция');
  const block = src.slice(idx, idx + 1600);
  assert.match(block, /chatAPI\.uploadChatVoice\(voiceUri/);
  assert.match(block, /chatAPI\.send\(\{/);
  assert.match(block, /clientMsgId: clientId/);
  assert.match(block, /sendStatus: 'sent'/);
  assert.match(block, /sendStatus: 'failed', sendError: message/);
});

test('retryFailedVoice: существует, переиспользует ТОТ ЖЕ clientId, не создаёт новый пузырь', () => {
  const idx = src.indexOf('const retryFailedVoice = React.useCallback');
  assert.ok(idx > 0, 'retryFailedVoice должна существовать');
  const block = src.slice(idx, idx + 500);
  assert.doesNotMatch(block, /newClientId\(/, 'retry не должен генерировать новый clientId — иначе задвоит сообщение');
  assert.match(block, /sendVoiceMessage\(item\.id,/, 'retry обязан вызывать sendVoiceMessage с id УЖЕ существующего пузыря');
  assert.match(block, /voiceUri: item\.voiceUri/);
  assert.match(block, /voiceBlob: item\.voiceBlob/);
  assert.match(block, /sendStatus: 'sending', sendError: null/, 'retry обязан визуально пометить пузырь как "снова отправляется"');
});

test('toggleVoice: первая отправка тоже идёт через sendVoiceMessage (один путь, не дублирующий код)', () => {
  const idx = src.indexOf('const toggleVoice = React.useCallback');
  assert.ok(idx > 0);
  const block = src.slice(idx, idx + 1600);
  assert.match(block, /await sendVoiceMessage\(clientId,/);
  assert.doesNotMatch(block, /chatAPI\.uploadChatVoice\(result\.uri/, 'старый инлайновый upload-код должен быть удалён, а не продублирован');
});

test('UI: кнопка retry для упавшего voice больше не disabled и вызывает retryFailedVoice', () => {
  const idx = src.indexOf("item.sendStatus === 'failed' && item.voice");
  assert.ok(idx > 0, 'ветка рендера для упавшего voice-сообщения должна существовать');
  const block = src.slice(idx, idx + 400);
  assert.doesNotMatch(block, /\bdisabled\b/, 'старый баг — кнопка была неактивна, тап ничего не делал');
  assert.match(block, /onPress=\{\(\) => retryFailedVoice\(item\)\}/);
  assert.match(block, /testID="deal-chat-voice-error"/);
});
