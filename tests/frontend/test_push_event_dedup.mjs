import test from 'node:test';
import assert from 'node:assert/strict';

async function dedup() {
  return import(`../../src/utils/pushEventDedup.js?t=${Date.now()}-${Math.random()}`);
}

async function resetStorage() {
  const store = (await import('./mocks/async-storage.mjs')).default;
  store.__reset();
}

test('one backend event is shown once in foreground but its first tap remains usable', async () => {
  await resetStorage();
  const mod = await dedup();
  mod.__resetPushEventDedupForTests();
  assert.equal(await mod.claimPushEvent('chat:room-1:42', 'display'), true);
  assert.equal(await mod.claimPushEvent('chat:room-1:42', 'display'), false);
  assert.equal(await mod.claimPushEvent('chat:room-1:42', 'navigation'), true);
  assert.equal(await mod.claimPushEvent('chat:room-1:42', 'navigation'), false);
});

test('invalid or oversized ids never poison the persistent dedup cache', async () => {
  await resetStorage();
  const mod = await dedup();
  mod.__resetPushEventDedupForTests();
  assert.equal(await mod.claimPushEvent('', 'display'), true);
  assert.equal(await mod.claimPushEvent('x'.repeat(257), 'display'), true);
  const store = (await import('./mocks/async-storage.mjs')).default;
  assert.deepEqual(store.__dump(), {});
});
