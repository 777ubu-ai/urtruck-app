import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileChatMessages } from '../../src/utils/chatMessageListState.js';
test('background STT readiness replaces the pending voice row without requiring a new message', () => {
  const pending = { id: 'voice-1', voice: true, voiceProcessingStatus: 'processing', voiceTranscriptReady: false };
  const ready = { ...pending, voiceProcessingStatus: 'ready', voiceTranscriptReady: true };
  const next = reconcileChatMessages([pending], [ready], []);
  assert.equal(next[0], ready);
  assert.equal(next[0].voiceTranscriptReady, true);
});
test('a failed or expired voice job replaces the previous ready row', () => {
  const ready = { id: 'voice-1', voice: true, voiceProcessingStatus: 'ready', voiceTranscriptReady: true };
  for (const status of ['failed', 'expired']) {
    const next = { ...ready, voiceProcessingStatus: status, voiceTranscriptReady: false };
    assert.equal(reconcileChatMessages([ready], [next], [])[0], next);
  }
});
test('a refreshed document download URL replaces the old signed URL', () => {
  const old = { id: 'doc-1', kind: 'document', docUrl: '/preview', docDownloadUrl: '/download?expires=1' };
  const fresh = { ...old, docDownloadUrl: '/download?expires=2' };
  assert.equal(reconcileChatMessages([old], [], [fresh])[0].docDownloadUrl, fresh.docDownloadUrl);
});
test('unchanged readiness and links keep the focused history array and row identities', () => {
  const row = { id: 'voice-1', voice: true, voiceProcessingStatus: 'ready', voiceTranscriptReady: true };
  const previous = [row];
  assert.equal(reconcileChatMessages(previous, [{ ...row }], []), previous);
});
