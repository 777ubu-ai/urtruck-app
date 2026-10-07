import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheIssuedAttachmentUrl as url } from '../../src/utils/attachmentUrlCache.js';
import { reconcileChatMessages } from '../../src/utils/chatMessageListState.js';
test('valid source remains stable, then renewed URL replaces it before expiry', () => {
  const cache = new Map(); const first = 'https://qa.invalid/a?exp=1000&sig=old', renewed = 'https://qa.invalid/a?exp=2000&sig=new';
  assert.equal(url(cache, 'photo:1', first, 0), first);
  assert.equal(url(cache, 'photo:1', renewed, 900000), first);
  assert.equal(url(cache, 'photo:1', renewed, 940000), renewed);
});
test('opaque signed URL cannot remain pinned forever', () => {
  const cache = new Map(); assert.equal(url(cache, 'voice:1', 'a?token=old', 0), 'a?token=old');
  assert.equal(url(cache, 'voice:1', 'a?token=new', 239999), 'a?token=old');
  assert.equal(url(cache, 'voice:1', 'a?token=new', 240000), 'a?token=new');
});
test('unavailable attachment clears cached URL and attachment IDs stay isolated', () => {
  const cache = new Map(); url(cache, 'doc:1', 'first', 0); url(cache, 'doc:2', 'second', 0);
  assert.equal(url(cache, 'doc:1', null, 1), null); assert.equal(cache.has('doc:1'), false); assert.equal(cache.get('doc:2').url, 'second');
});
test('stable polling retains message identity; renewed URL updates existing bubble', () => {
  const item = { id: '1', text: '', mediaUrl: 'old', createdAt: '2026-10-07' };
  const previous = [item]; assert.equal(reconcileChatMessages(previous, [{ ...item }], []), previous);
  const next = reconcileChatMessages(previous, [{ ...item, mediaUrl: 'renewed' }], []);
  assert.equal(next.length, 1); assert.equal(next[0].mediaUrl, 'renewed'); assert.notEqual(next, previous);
});
