import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (name) => import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL('../../src/utils/' + name, import.meta.url), 'utf8')).toString('base64'));
const { createOneSignalForegroundHandler } = await load('oneSignalForeground.js');
const { decideForegroundPresentation } = await load('pushRuntime.js');
function setup(data, room = null, claimDisplay = async () => true) {
  const calls = [];
  const handler = createOneSignalForegroundHandler({ decide: decideForegroundPresentation, readActiveRoom: () => room, claimDisplay });
  const event = { preventDefault: () => calls.push('prevent'), notification: { additionalData: data, display: () => calls.push('display') } };
  return { calls, handler, event };
}
test('prevents SDK display synchronously while async policy is pending', async () => {
  let resolve;
  const x = setup({ event_id: 'new', type: 'chat_message', room_id: 'b' }, 'a', () => new Promise(r => { resolve = r; }));
  const task = x.handler(x.event);
  assert.deepEqual(x.calls, ['prevent']);
  resolve(true);
  assert.equal(await task, true);
  assert.deepEqual(x.calls, ['prevent', 'display']);
});
test('currently open room suppresses message and attachment banners', async () => {
  for (const type of ['chat_message', 'chat_attachment']) {
    const x = setup({ type, room_id: 'a' }, 'a');
    assert.equal(await x.handler(x.event), false);
    assert.deepEqual(x.calls, ['prevent']);
  }
});
test('other-room and deal notifications remain visible', async () => {
  for (const data of [{ type: 'chat_message', room_id: 'b' }, { type: 'deal_accepted' }]) {
    const x = setup(data, 'a');
    assert.equal(await x.handler(x.event), true);
    assert.deepEqual(x.calls, ['prevent', 'display']);
  }
});
test('duplicate backend event is suppressed using existing policy', async () => {
  const x = setup({ type: 'chat_message', room_id: 'b', event_id: 'same' }, 'a', async () => false);
  assert.equal(await x.handler(x.event), false);
  assert.deepEqual(x.calls, ['prevent']);
});
test('policy failures do not reject native callback or display unapproved banner', async () => {
  const x = setup({ event_id: 'bad' }, null, async () => { throw new Error('storage'); });
  assert.equal(await x.handler(x.event), false);
  assert.deepEqual(x.calls, ['prevent']);
});
