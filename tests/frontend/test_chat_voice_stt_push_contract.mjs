import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const bubble = readFileSync('src/components/VoiceMessageBubble.js', 'utf8');
const voiceTextState = readFileSync('src/utils/voiceTranscriptState.js', 'utf8');
const frontendChatApi = readFileSync('src/utils/chatAPI.js', 'utf8');
const chatApi = readFileSync('backend/api/chat.py', 'utf8');
const pushI18n = readFileSync('backend/services/push_i18n.py', 'utf8');
const workflow = readFileSync('.github/workflows/production-deploy-execute.yml', 'utf8');
const bootstrap = readFileSync('scripts/remote_bootstrap_secure_env.sh', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const qa2Ai = readFileSync('backend/qa_ai_service/main.py', 'utf8');

test('voice one-tap STT attaches the current-language translation and remains retryable', () => {
  assert.match(workspace, /voiceText\.toggle\(item, lang\)/);
  assert.match(voiceTextState, /api\.transcribe\(entry\.id, lang\)/);
  assert.match(voiceTextState, /translation_provider/);
  assert.match(voiceTextState, /translation_error/);
  assert.match(workspace, /const toggleVoiceOriginal = React\.useCallback/);
  assert.match(workspace, /onRetryTranslation=\{\(\) => translateVoiceTranscript\(item\)\}/);
  assert.match(bubble, /const primaryTranscript = hasTranslation/);
  assert.match(bubble, /testID="voice-original-btn"/);
  assert.match(bubble, /testID="voice-transcription-retry"/);
  assert.doesNotMatch(bubble, /voice-translation-btn/);
});

test('queued translation and long transcription override the shared 20 second timeout', () => {
  assert.match(frontendChatApi, /authedFetchWithTimeout\(`\$\{BASE\}\/translate`[\s\S]*?120000\)/);
  assert.match(frontendChatApi, /authedFetchWithTimeout\(`\$\{BASE\}\/transcribe`[\s\S]*?240000\)/);
  assert.match(frontendChatApi, /signal: controller\.signal/);
});

test('QA2 CPU speech inference uses bounded low-latency decoding', () => {
  assert.match(qa2Ai, /_slot = threading\.BoundedSemaphore\(1\)/);
  assert.match(qa2Ai, /beam_size=1/);
  assert.match(qa2Ai, /best_of=1/);
  assert.match(qa2Ai, /condition_on_previous_text=False/);
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
