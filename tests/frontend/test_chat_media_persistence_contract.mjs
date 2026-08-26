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
  assert.match(workspace, /testID="deal-chat-message-retry"/);
  assert.match(workspace, /const retryFailedText = React\.useCallback/);
  // The queued (offline/outbox) path must stay visually distinct from a hard
  // failure — a transient network gap is not "your message failed".
  assert.match(workspace, /sendStatus: 'queued'/);
});

test('voice recording shows a live indicator, timer, waveform, and both stop and cancel controls', () => {
  assert.match(workspace, /testID="deal-chat-recording-bar"/);
  assert.match(workspace, /testID="deal-chat-recording-cancel"/);
  assert.match(workspace, /testID="deal-chat-recording-stop"/);
  assert.match(workspace, /recordSecs % 60/);
  assert.match(workspace, /recordWaveBar/);
  assert.match(workspace, /const cancelRecording = React\.useCallback/);
  assert.match(workspace, /!\s*recording \? \(\s*<TouchableOpacity[\s\S]*testID="deal-chat-camera"/);
  assert.match(workspace, /!\s*recording \? \(\s*input\.trim\(\) \? \(\s*<TouchableOpacity[\s\S]*testID="deal-chat-send"[\s\S]*\)\s*:\s*\(\s*<TouchableOpacity[\s\S]*testID="deal-chat-voice"/);
});

test('voice failures distinguish record vs upload vs send, each with its own message', () => {
  assert.match(workspace, /t\('voice_error_record'\)/);
  assert.match(workspace, /t\('voice_error_upload'\)/);
  assert.match(workspace, /t\('voice_error_send'\)/);
});

test('voice message is rendered optimistically before upload finishes, so the chat never waits on network before showing the bubble', () => {
  assert.match(workspace, /const appendOptimisticVoice = React\.useCallback/);
  assert.match(workspace, /sendStatus: 'uploading'/);
  assert.match(workspace, /mediaUrl: uri/);
  assert.match(workspace, /voice: true/);
  assert.match(workspace, /const clientId = appendOptimisticVoice\(result\.uri, duration\)/);
  assert.match(workspace, /clientMsgId: clientId,/);
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
  assert.match(workspace, /blob: result\.blob \|\| null,/);
  assert.match(workspace, /type: result\.blob\?\.type \|\| null,/);
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

test('voice upload failures distinguish too-large, storage-rejected/unreachable, and generic causes, not one flat message', () => {
  const fn = workspace.match(/upload = await chatAPI\.uploadChatVoice\(result\.uri, \{[\s\S]*?\n    \} catch \(error\) \{([\s\S]*?)\n    \}/);
  assert.ok(fn, 'toggleVoice upload catch block not found');
  assert.match(fn[1], /error\?\.status === 413 \? 'doc_error_too_large'/);
  assert.match(fn[1], /error\?\.status >= 500 \? 'doc_error_server'/);
  assert.match(fn[1], /'voice_error_upload'/);
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

// ─── P0 crash-hardening (26.08.2026) ────────────────────────────────────
// The three regressions below cover known-real crash and drop-bubble
// scenarios in the voice send path that surfaced after voice UX was made
// optimistic on 820d8f7:
//   1) Native iOS crash "Only one Recording object can be prepared at a
//      given time" when the previous _recording wasn't fully unloaded
//      (double-tap record, screen unmount mid-stopRecording, back-nav
//      during upload). The recorder module must clear _recording BEFORE
//      creating a new one, and null it out on start failure.
//   2) Rapid double-send of voice messages: both optimistic bubbles have
//      the exact same body («🎤 voiceMessage»). The generic text-equality
//      merge-dedup collapses both when the first server reply arrives, and
//      the second bubble disappears until the next poll. The voice branch
//      must dedup only by clientMsgId.
//   3) toggleVoice performs three sequential awaits (upload, send, and a
//      timer). If the user leaves the screen between them, setMessages /
//      toast / setRoomId run on an unmounted component. The handler must
//      early-return via mounted.current before touching state.
test('voice recorder clears any lingering _recording BEFORE createAsync (prevents iOS "Only one Recording" native crash on double-record)', () => {
  const recorder = fs.readFileSync('src/utils/voiceRecorder.js', 'utf8');
  assert.match(recorder, /if \(_recording\) \{\s*\n\s*try \{ await _recording\.stopAndUnloadAsync\(\); \} catch \{[^}]*\}\s*\n\s*_recording = null;\s*\n\s*\}/);
  // The start-failure catch must also null out _recording so the NEXT tap
  // starts from a clean state instead of tripping the same crash again.
  assert.match(recorder, /} catch \(e\) \{\s*\n\s*console\.warn\('\[voice\] start failed:'[^]*?_recording = null;\s*\n\s*return false;\s*\n\s*\}/);
});

test('rapid double-send of voice messages does not collapse into one bubble (voice merge-dedup by clientMsgId only)', () => {
  // The generic text-equality fallback matches EVERY same-text voice bubble
  // and, because all voice bubbles share «🎤 voiceMessage», one server row
  // would filter every optimistic voice bubble. The voice branch must dedup
  // only by clientMsgId.
  assert.match(workspace, /if \(item\.voice\) \{\s*\n\s*return !merged\.some\(\(server\) => server\.clientMsgId === item\.id\);\s*\n\s*\}/);
});

test('toggleVoice guards every state update after unmount (upload, send, network retry — none run setMessages/toast on an unmounted screen)', () => {
  const fn = workspace.match(/const toggleVoice = React\.useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[[\s\S]*?appendOptimisticVoice[\s\S]*?\]\);/);
  assert.ok(fn, 'toggleVoice body not found');
  const body = fn[1];
  // Every "recovery" point after an awaited call must check mounted.current
  // before touching state. Count all mounted.current guards inside the
  // handler — there must be at least six (upload error, upload empty-key,
  // pre-payload sending, send success, send network fallback, send generic
  // failure), matching the six awaits that follow user-visible state.
  const guardCount = (body.match(/if \(!mounted\.current\) return;/g) || []).length;
  assert.ok(guardCount >= 6, `expected >= 6 mounted.current early-returns in toggleVoice; got ${guardCount}`);
});
