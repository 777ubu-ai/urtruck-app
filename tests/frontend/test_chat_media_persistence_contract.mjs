// test_chat_media_persistence_contract — deal chat QA pass (PR #255, 2026-08-20).
//
// Covers what test_deal_workspace.mjs (layout/composer/menu contract) and
// test_deal_attachment_upload_contract.mjs (backend MIME/idempotency
// contract) don't: photo persistence across polling, the full-screen photo
// viewer, documents rendering as ordinary bubbles in the same feed as
// text/photo/voice (not a separate panel), document retry, chronological
// merge-ordering of two different backend tables into one feed, and that
// send/upload errors keep their real status/detail instead of being
// swallowed into one generic toast.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const chatApi = fs.readFileSync('src/utils/chatAPI.js', 'utf8');
const chatPy = fs.readFileSync('backend/api/chat.py', 'utf8');

test('a signed photo/document URL is cached per message id, not re-fetched fresh on every 3s poll', () => {
  // The exact bug class this guards against: ChatScreen.js already fixed it
  // once (attachmentUrlCache); DealWorkspaceScreenV2.js never had the fix and
  // was flickering every poll for any deal with a photo message.
  assert.match(workspace, /attachmentUrlCache = React\.useRef\(new Map\(\)\)/);
  assert.match(workspace, /attachmentUrlCache\.current\.get\(cacheKey\) \|\| issuedUrl/);
  assert.match(workspace, /attachmentUrlCache\.current\.set\(cacheKey, mediaUrl\)/);
  // The cache must also cover documents, not just photo/voice.
  assert.match(workspace, /attachmentUrlCache\.current\.set\(cacheKey, docUrl\)/);
});

test('tapping a photo bubble opens a full-screen viewer with an explicit close button', () => {
  assert.match(workspace, /setFullImage\(item\.mediaUrl\)/);
  assert.match(workspace, /testID="deal-chat-photo-bubble"/);
  assert.match(workspace, /testID="deal-chat-photo-fullscreen"/);
  assert.match(workspace, /testID="deal-chat-photo-close"/);
  assert.match(workspace, /onPress=\{\(\) => setFullImage\(null\)\}/);
  // Section 4 explicitly rejects relying only on the OS long-press menu —
  // the viewer's own dedicated close affordance is the real fix.
  assert.match(workspace, /<Modal visible=\{!!fullImage\}/);
});

test('documents render as message bubbles inside the same FlatList, not a separate panel above the composer', () => {
  assert.doesNotMatch(workspace, /<DealAttachments/, 'the old separate document panel must be gone from this screen');
  assert.doesNotMatch(workspace, /import DealAttachments/);
  assert.match(workspace, /item\.kind === 'document'/);
  assert.match(workspace, /testID="deal-chat-document-bubble"/);
  // Confirm it is the SAME FlatList that renders text/photo/voice, i.e. one
  // feed — not a second list mounted alongside it.
  const flatListBlocks = [...workspace.matchAll(/<FlatList/g)];
  assert.ok(flatListBlocks.length >= 1);
  assert.match(workspace, /data=\{messages\}[\s\S]{0,40}renderItem=\{renderMessage\}/);
});

test('a failed document upload shows a distinct reason and a working retry, not a generic error', () => {
  assert.match(workspace, /testID="deal-chat-document-retry"/);
  assert.match(workspace, /onPress=\{\(\) => retryDocument\(item\)\}/);
  assert.match(workspace, /const retryDocument = React\.useCallback/);
  // Every taxonomy branch from section 5 must map to its own i18n key, not
  // collapse into one string.
  for (const key of ['doc_error_network', 'doc_error_too_large', 'doc_error_unsupported', 'doc_error_forbidden', 'doc_error_server', 'doc_error_failed']) {
    assert.match(workspace, new RegExp(key.replace('_', '_')), `uploadDocument must be able to select ${key}`);
  }
  assert.match(workspace, /error\?\.status === 413 \? 'doc_error_too_large'/);
  assert.match(workspace, /error\?\.status === 415 \? 'doc_error_unsupported'/);
  assert.match(workspace, /error\?\.status === 401 \|\| error\?\.status === 403\) \? 'doc_error_forbidden'/);
});

test('document upload retry reuses the same clientUploadId — no duplicate file on double-tap', () => {
  assert.match(workspace, /clientUploadId: docItem\.id/);
  const uploadDocumentBlock = workspace.match(/const uploadDocument = React\.useCallback\(async \(docItem\) => \{([\s\S]*?)\n  \}, \[/);
  assert.ok(uploadDocumentBlock, 'uploadDocument definition not found');
  assert.match(uploadDocumentBlock[1], /chatAPI\.uploadAttachment/);
});

test('the feed merges chat_messages and message_attachments chronologically by created_at, not by insertion order', () => {
  assert.match(workspace, /parseServerDate/);
  assert.match(workspace, /const merged = \[\.\.\.mapped, \.\.\.serverDocs\]\.sort/);
  assert.match(workspace, /dx - dy/);
});

test('an optimistic document bubble is dropped once the server confirms it, matched by clientUploadId', () => {
  assert.match(workspace, /serverDocs\.some\(\(d\) => d\.clientUploadId === item\.id\)/);
});

test('text send failures keep the real backend status/detail instead of one generic message', () => {
  assert.match(chatApi, /const body = await r\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(chatApi, /err\.detail = detail/);
  assert.match(workspace, /error\?\.status === 403/);
  assert.match(workspace, /t\('chat_error_403'\)/);
  assert.match(workspace, /error\?\.status === 400 && error\?\.detail/);
  assert.match(workspace, /t\('chat_error_prefix'\)/);
  // The 403 case is real and enumerable server-side (chat gated until the
  // deal is accepted) — confirm that is genuinely what the backend raises,
  // not a guess about what a 403 might mean.
  assert.match(chatPy, /status_code=403, detail="Чат сделки доступен только после принятия предложения"/);
});

test('a failed text message keeps its optimistic bubble visible with a retry, never silently disappears', () => {
  assert.match(workspace, /sendStatus: 'failed', sendError: errorText/);
  assert.match(workspace, /'deal-chat-message-retry'/);
  assert.match(workspace, /const retryFailedText = React\.useCallback/);
  // The queued (offline/outbox) path must stay visually distinct from a hard
  // failure — a transient network gap is not "your message failed".
  assert.match(workspace, /sendStatus: 'queued'/);
});

test('voice recording shows a live indicator, timer, waveform, and send/cancel controls', () => {
  assert.match(workspace, /testID="deal-chat-recording-bar"/);
  assert.match(workspace, /testID="deal-chat-recording-cancel"/);
  assert.match(workspace, /testID="deal-chat-recording-send"/);
  assert.match(workspace, /name="paper-plane"/);
  assert.doesNotMatch(workspace, /testID="deal-chat-recording-stop"/);
  assert.match(workspace, /recordSecs % 60/);
  assert.match(workspace, /recordWaveBar/);
  assert.match(workspace, /const cancelRecording = React\.useCallback/);
  assert.match(workspace, /!\s*recording \? \(\s*<TouchableOpacity[\s\S]*testID="deal-chat-camera"/);
  assert.match(workspace, /!\s*recording \? \(\s*input\.trim\(\) \? \(\s*<TouchableOpacity[\s\S]*testID="deal-chat-send"[\s\S]*\)\s*:\s*\(\s*<TouchableOpacity[\s\S]*testID="deal-chat-voice"/);
});

test('voice send renders an optimistic bubble immediately before upload and reuses its clientMsgId', () => {
  // Доставка вынесена из toggleVoice в deliverVoice (fresh-voice-delivery),
  // чтобы Retry повторял ту же цепочку целиком. Контракт тот же и проверяется
  // строже: запись создаёт пузырь, доставка начинается только после этого.
  const fn = workspace.match(/const toggleVoice = React\.useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/);
  assert.ok(fn, 'toggleVoice definition not found');
  const body = fn[1];
  const deliver = workspace.slice(
    workspace.indexOf('const deliverVoice = React.useCallback'),
    workspace.indexOf('const toggleVoice = React.useCallback'),
  );
  assert.ok(deliver.length > 0, 'deliverVoice definition not found');

  const optimisticIndex = body.indexOf("setMessages((items) => [...items, voiceItem])");
  const deliverIndex = body.indexOf('await deliverVoice(voiceItem)');
  assert.ok(optimisticIndex >= 0, 'voice optimistic bubble must be appended before network work');
  assert.ok(deliverIndex > optimisticIndex, 'delivery must start after the local bubble is visible');
  assert.doesNotMatch(body, /chatAPI\.(uploadChatVoice|send)\(/,
    'запись не должна сама ходить в сеть — только через deliverVoice');
  assert.match(deliver, /chatAPI\.uploadChatVoice\(/, 'deliverVoice must own the upload');

  assert.match(body, /const clientId = newClientId\('voice'\)/);
  assert.match(body, /sendStatus: 'sending'/);
  assert.match(body, /clientMsgId: clientId/);
  assert.match(workspace, /server\.clientMsgId === item\.id/);
  // Провал по-прежнему помечает пузырь — и теперь даёт повтор.
  assert.match(deliver, /sendStatus: 'failed', sendError: message/);
  assert.match(workspace, /testID="deal-chat-voice-retry"/);
});

test('voice failures distinguish record vs upload vs send, each with its own message', () => {
  assert.match(workspace, /t\('voice_error_record'\)/);
  assert.match(workspace, /t\('voice_error_upload'\)/);
  assert.match(workspace, /t\('voice_error_send'\)/);
});

test('voice message is rendered optimistically before upload finishes, so the chat never waits on network before showing the bubble', () => {
  // Раньше этот контракт матчил `appendOptimisticVoice` — функцию, которая
  // определена, но НИ РАЗУ не вызывается, и её ЗАКОММЕНТИРОВАННЫЙ вызов.
  // То есть тест был зелёным, не проверяя живой путь вовсе. Теперь
  // проверяется реально исполняемая ветка.
  const live = workspace.match(/const toggleVoice = React\.useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/);
  assert.ok(live, 'toggleVoice definition not found');
  const liveBody = live[1];
  assert.match(liveBody, /voice: true,/);
  assert.match(liveBody, /mediaUrl: result\.uri,/);
  assert.match(liveBody, /sendStatus: 'sending',/);
  assert.match(liveBody, /clientMsgId: clientId,/);
  // пузырь добавляется ДО любой сетевой работы
  assert.ok(
    liveBody.indexOf('setMessages((items) => [...items, voiceItem])') < liveBody.indexOf('await deliverVoice'),
    'bubble must be appended before delivery starts',
  );
  assert.match(workspace, /item\.sendStatus === 'failed' && !item\.voice/);
});

test('the geolocation quick action requests foreground permission and sends a real openable map link', () => {
  assert.match(workspace, /const sendLocation = React\.useCallback/);
  assert.match(workspace, /requestForegroundLocationPermission/);
  assert.match(workspace, /getCurrentLocationPayload/);
  assert.match(workspace, /yandexMapsLink\(point\.lat, point\.lng\)/);
  assert.match(workspace, /t\('location_denied'\)/);
  // Must not be confused with the in-app trip map — it sends the sender's
  // own current position as a chat message, nothing else.
  const fn = workspace.match(/const sendLocation = React\.useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/);
  assert.ok(fn);
  assert.doesNotMatch(fn[1], /setViewMode\(VIEW_MAP\)/);
});

test('quick reply and call-link send fixed, localized text through the same error-handled path as manual text', () => {
  assert.match(workspace, /const sendQuickReply = React\.useCallback\(\(\) => \{\s*setAttachOpen\(false\);\s*sendRawText\(t\('deal_chat_quick_reply'\)\)/);
  assert.match(workspace, /const sendCallLink = React\.useCallback/);
  assert.match(workspace, /sendRawText\(t\('deal_chat_call_link_text'\)\)/);
});

test('the call menu is honest about what works: only "send call link" is enabled, audio/video/schedule show coming-soon and do nothing', () => {
  assert.match(workspace, /testID="deal-call-menu"/);
  assert.match(workspace, /testID:\s*'deal-call-send-link'/);
  assert.match(workspace, /disabled: true/);
  assert.match(workspace, /ui\.comingSoon/);
  const menuBlock = workspace.match(/\{ key: 'audio'[\s\S]*?\{ key: 'schedule'[^}]*\},/);
  assert.ok(menuBlock, 'call menu item list not found');
  // audio/video/schedule must all be disabled; only link may omit `disabled: true`.
  const disabledCount = [...menuBlock[0].matchAll(/disabled: true/g)].length;
  assert.equal(disabledCount, 3, `expected exactly 3 disabled call-menu items (audio/video/schedule), found ${disabledCount}`);
});

// P0 2026-08-21: production voice/document upload investigation. These pin
// down the exact contract that must hold for a REAL browser MediaRecorder
// Blob to reach the backend as a non-empty multipart file, so a regression
// here (e.g. someone "simplifying" uploadChatVoice back to uri-only) fails
// a fast static test instead of only showing up as a silent prod 400/502.
test('web voice upload sends a real Blob/File in FormData, never an empty/placeholder part', () => {
  // The caller (DealWorkspaceScreenV2.toggleVoice) must forward the actual
  // recorder Blob, not just re-derive it by re-fetching the blob: URI —
  // the URI can already be revoked/stale by the time upload runs.
  assert.match(chatApi, /async uploadChatVoice\(uri, \{ blob: providedBlob = null, type = null, name = null \} = \{\}\)/);
  assert.match(chatApi, /const blob = providedBlob \|\| await fetch\(uri\)\.then\(\(r\) => r\.blob\(\)\)/);
  // The real MIME (from the recorder) drives both the file extension and the
  // Content-Type sent to the server — never hardcoded to one format.
  assert.match(chatApi, /const mime = type \|\| blob\.type \|\| 'audio\/webm'/);
  assert.match(chatApi, /new File\(\[blob\], name \|\| `voice\.\$\{ext\}`, \{ type: mime \}\)/);
  assert.match(chatApi, /form\.append\('file', part, name \|\| `voice\.\$\{ext\}`\)/);
  // DealWorkspaceScreenV2 must actually pass the recorder's real blob/type
  // through, not just the uri — otherwise the FormData contract above is
  // dead code that nothing ever exercises.
  // Blob теперь едет через оптимистичный item (voiceBlob/voiceMime), потому
  // что доставку выполняет deliverVoice и её же повторяет Retry. Контракт
  // тот же: наверх уходит НАСТОЯЩИЙ blob рекордера, а не перечитанный URI.
  assert.match(workspace, /voiceBlob: result\.blob \|\| null,/);
  assert.match(workspace, /voiceMime: result\.blob\?\.type \|\| null,/);
  assert.match(workspace, /blob: item\.voiceBlob \|\| null,/);
  assert.match(workspace, /type: item\.voiceMime \|\| null,/);
});

test('voiceRecorder produces a real, non-empty web Blob before upload is attempted', () => {
  const recorder = fs.readFileSync('src/utils/voiceRecorder.js', 'utf8');
  // iOS Safari on a short recording can hand MediaRecorder zero data at
  // stop() unless timesliced + explicitly flushed — both guards must exist.
  assert.match(recorder, /this\._webRecorder\.start\(400\)/);
  assert.match(recorder, /requestData\(\)/);
  // A genuinely empty recording must fail loudly client-side (surfaces as
  // voice_error_record), not silently upload a 0-byte file the backend
  // would then reject anyway.
  assert.match(recorder, /if \(!blob \|\| blob\.size === 0\) \{ resolve\(null\); return; \}/);
});

test('voice playback is single-instance so repeated taps do not create echo', () => {
  // 28.08.2026: воспроизведение переехало из инлайн-обработчика экрана в
  // переиспользуемый VoiceMessageBubble (WhatsApp-паритет: pause/seek/rate).
  // Смысл теста тот же — ОДИН активный трек, повторный тап не даёт эхо.
  const recorder = fs.readFileSync('src/utils/voiceRecorder.js', 'utf8');
  const bubble = fs.readFileSync('src/components/VoiceMessageBubble.js', 'utf8');

  // Экран отдаёт голосовое в бабл и по-прежнему показывает ошибку тостом.
  assert.match(workspace, /<VoiceMessageBubble/);
  assert.match(workspace, /uri=\{item\.mediaUrl\}/);
  assert.match(workspace, /toast\(t\('voice_play_fail'\), 'error'\)/);

  // Повторный тап = toggle (пауза), а НЕ второй экземпляр воспроизведения.
  assert.match(bubble, /voice\.toggle\(uri\)/);
  assert.doesNotMatch(bubble, /voice\.play\(/, 'бабл не должен стартовать второй трек напрямую');

  // Гарды единственного активного трека в плеере — без изменений.
  assert.match(recorder, /let _webAudio = null/);
  assert.match(recorder, /let _playingUri = null/);
  assert.match(recorder, /let _playPromise = null/);
  assert.match(recorder, /_playingUri === uri/);
  assert.match(recorder, /!_webAudio\.paused && !_webAudio\.ended/);
  assert.match(recorder, /_webAudio\.pause\(\)/);
  assert.match(recorder, /_playingUri = null/);
});

test('voice bubble has WhatsApp-grade controls: pause, seek, rate, live progress', () => {
  // Регрессия на заявку владельца 28.08.2026: «нажал — идёт без остановки,
  // паузы нету». Раньше был статичный ▶ и play() без остановки.
  const recorder = fs.readFileSync('src/utils/voiceRecorder.js', 'utf8');
  const bubble = fs.readFileSync('src/components/VoiceMessageBubble.js', 'utf8');

  // Плеер умеет всё, что нужно для WhatsApp-поведения.
  for (const api of ['subscribe(listener)', 'async toggle(uri)', 'async pause()', 'async resume()', 'async seek(uri, positionMillis)', 'async setRate(rate)']) {
    assert.ok(recorder.includes(api), `voiceRecorder должен экспортировать ${api}`);
  }
  // Живой прогресс: тик достаточно частый для плавной полосы.
  assert.match(recorder, /progressUpdateIntervalMillis: 80/);
  assert.match(recorder, /setInterval\(tick, 80\)/, 'web-плеер тоже должен тикать прогресс');
  // По окончании — сброс в начало, кнопка снова play (не «залипает» в конце).
  assert.match(recorder, /didJustFinish/);
  assert.match(recorder, /isPlaying: false, positionMillis: 0/);

  // UI: иконка реально переключается play↔pause, есть seek-полоса и скорость.
  assert.match(bubble, /isPlaying \? 'pause' : 'play'/);
  assert.match(bubble, /testID="voice-progress-track"/);
  assert.match(bubble, /voice\.seek\?\.\(uri,/);
  assert.match(bubble, /const RATES = \[1, 1\.5, 2\]/);
  assert.match(bubble, /voice\.subscribe\?\./, 'бабл обязан подписываться на состояние плеера');
  // Активен только тот бабл, чей трек играет — иначе все показывали бы pause.
  assert.match(bubble, /state\.uri === uri/);
  // Транскрипция не должна исчезать при улучшении плеера: кнопка и текст
  // живут в том же voice bubble, включая комнату сделки.
  assert.match(bubble, /testID="voice-transcript-toggle"/);
  assert.match(bubble, /testID="voice-transcript"/);
  assert.match(bubble, /t\('voice_to_text'\)/);
  assert.match(bubble, /t\('voice_original_label'\)/);
  assert.match(bubble, /t\('voice_translation_label'\)/);
});

test('voice upload failures distinguish too-large, storage-rejected/unreachable, and generic causes, not one flat message', () => {
  // catch загрузки переехал в deliverVoice вместе со всей доставкой.
  const deliverSrc = workspace.slice(
    workspace.indexOf('const deliverVoice = React.useCallback'),
    workspace.indexOf('const toggleVoice = React.useCallback'),
  );
  const fn = deliverSrc.match(/upload = await chatAPI\.uploadChatVoice\([\s\S]*?\n    \} catch \(error\) \{([\s\S]*?)\n    \}\n/);
  assert.ok(fn, 'deliverVoice upload catch block not found');
  assert.match(fn[1], /error\?\.status === 413 \? 'doc_error_too_large'/);
  assert.match(fn[1], /error\?\.status >= 500 \? 'doc_error_server'/);
  assert.match(fn[1], /'voice_error_upload'/);
  // сетевой сбой отделён от серверного и не теряет запись
  assert.match(fn[1], /error\?\.isNetwork/);
});

test('backend distinguishes network/DNS failure reaching storage from storage actively rejecting the file', () => {
  const storageService = fs.readFileSync('backend/services/storage_service.py', 'utf8');
  // StorageSaveError.status_code is only set when the PROVIDER responded
  // (an HTTPStatusError) — left None on a pure transport/DNS failure. Both
  // the voice and document upload endpoints must read this distinction
  // instead of collapsing every storage exception into one generic 502.
  assert.match(storageService, /except httpx\.HTTPStatusError as exc:/);
  assert.match(storageService, /except httpx\.HTTPError as exc:/);
  assert.match(storageService, /raise StorageSaveError\("Supabase Storage is unavailable", provider="supabase", detail=str\(exc\)\) from exc/);
  assert.match(chatPy, /\[voice-storage\] failed/);
  const deal_room = fs.readFileSync('backend/api/deal_room.py', 'utf8');
  assert.match(deal_room, /\[attachment-storage\] failed/);
});
