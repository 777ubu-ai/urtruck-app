import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const bubble = readFileSync('src/components/VoiceMessageBubble.js', 'utf8');
const chatApi = readFileSync('backend/api/chat.py', 'utf8');
const pushI18n = readFileSync('backend/services/push_i18n.py', 'utf8');
const workflow = readFileSync('.github/workflows/production-deploy-execute.yml', 'utf8');
const bootstrap = readFileSync('scripts/remote_bootstrap_secure_env.sh', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');

test('voice one-tap STT attaches the current-language translation and remains retryable', () => {
  assert.match(workspace, /chatAPI\.transcribe\(item\.id, getLanguage\(\)\.toLowerCase\(\)\)/);
  assert.match(workspace, /translation_provider/);
  assert.match(workspace, /translation_error/);
  assert.match(workspace, /const translateVoiceTranscript = React\.useCallback/);
  assert.match(bubble, /testID="voice-transcription-retry"/);
  assert.match(bubble, /testID="voice-translation-btn"/);
});

test('persisted transcript reaches the second participant through the message API', () => {
  assert.match(workspace, /transcript: message\.voice_transcript \|\| null/);
  assert.match(workspace, /transcriptLang: message\.voice_transcript_lang \|\| null/);
  assert.match(workspace, /transcriptProvider: message\.voice_transcript_provider \|\| null/);
  assert.match(chatApi, /UPDATE chat_messages SET voice_transcript =/);
});

test('voice push has its own event and is localized per device', () => {
  assert.match(chatApi, /kind="chat\.voice" if body\.is_voice else "chat"/);
  assert.match(chatApi, /"event": "chat\.voice" if body\.is_voice else "chat\.message"/);
  assert.match(chatApi, /"i18n_event": "chat_voice"/);
  for (const locale of ['RU', 'KK', 'ZH', 'EN']) assert.match(pushI18n, new RegExp(`"${locale}":`));
});

test('STT production configuration is secret-backed and never printed', () => {
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /TRANSCRIBE_PROVIDER/);
  assert.match(workflow, /TRANSCRIBE_MODEL/);
  assert.match(bootstrap, /set_env OPENAI_API_KEY/);
  assert.match(bootstrap, /OPENAI_API_KEY_PRESENT=(yes|no)/);
  assert.doesNotMatch(bootstrap, /echo.*OPENAI_API_KEY[^_].*\$\{/);
  assert.match(i18n, /voice_translate: 'Перевести'/);
  assert.match(i18n, /voice_translate: '翻译'/);
  assert.match(i18n, /voice_translate: 'Translate'/);
});
