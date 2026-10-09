import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../src/utils/oneSignalClicks.js', import.meta.url), 'utf8');
const { createOneSignalClickBridge } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const event = (id, room = 'room-a') => ({ notification: { notificationId: id, additionalData: { type: 'chat_message', room_id: room, event_id: id, url: '/chats/stale' } } });
const tick = () => new Promise(resolve => setImmediate(resolve));
test('cold start keeps latest tap until authenticated handler attaches', async () => {
  const bridge = createOneSignalClickBridge();
  bridge.receive(event('old')); bridge.receive(event('new'));
  const seen = []; bridge.subscribe(response => seen.push(response));
  await tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].notification.request.content.data.event_id, 'new');
  assert.equal(seen[0].notification.request.content.data.room_id, 'room-a');
});
test('startup tap expires instead of routing much later', async () => {
  let time = 0; const bridge = createOneSignalClickBridge({ now: () => time, ttl: 60 });
  bridge.receive(event('expired')); time = 61;
  const seen = []; bridge.subscribe(response => seen.push(response)); await tick();
  assert.deepEqual(seen, []);
});
test('session cleanup cancels an already scheduled delivery', async () => {
  const bridge = createOneSignalClickBridge(); const old = []; const next = [];
  const stop = bridge.subscribe(response => old.push(response));
  bridge.receive(event('prior-account')); stop();
  bridge.subscribe(response => next.push(response)); await tick();
  assert.deepEqual(old, []); assert.deepEqual(next, []);
});
test('replacing subscriber cannot deliver stale task to new account', async () => {
  const bridge = createOneSignalClickBridge(); const seen = [];
  bridge.subscribe(() => seen.push('old')); bridge.receive(event('old'));
  bridge.subscribe(() => seen.push('new')); await tick();
  assert.deepEqual(seen, []);
});
test('invalid SDK callbacks and rejected handler do not escape', async () => {
  const bridge = createOneSignalClickBridge();
  bridge.receive(null); bridge.receive({ notification: { additionalData: [] } });
  bridge.subscribe(async () => { throw new Error('offline'); });
  bridge.receive(event('valid')); await tick();
});
