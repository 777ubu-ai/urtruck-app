import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/utils/readNotifications.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
function harness(records, current = () => true) {
  const removed = [], sdk = [];
  const ctx = { Platform: { OS: 'android' }, notificationData: d => d || {}, markOneSignalDismissed: r => sdk.push(r.identifier),
    require: () => ({ getPresentedNotificationsAsync: async () => records, dismissNotificationAsync: async id => removed.push(id) }) };
  vm.runInNewContext(source + '\nglobalThis.run = dismissConfirmedNotifications;', ctx);
  return { removed, sdk, run: confirmation => ctx.run(confirmation, { readBefore: 100, isCurrent: current }) };
}
const n = (id, notification_id, date = 50) => ({ date, request: { identifier: id, content: { data: { notification_id } } } });
test('confirmed cleanup preserves other rooms, unknown IDs and newer arrivals', async () => {
  const h = harness([n('read', 7), n('other', 8), n('new', 7, 101), n('unknown', null), n('undated', 7, 0)]);
  await h.run({ ok: true, read_ids: [7] });
  assert.deepEqual(h.removed, ['read']); assert.deepEqual(h.sdk, ['read']);
});
test('failure or account switch cannot remove any OS notification', async () => {
  const h = harness([n('read', 7)]); await h.run({ ok: false, read_ids: [7] }); assert.deepEqual(h.removed, []);
  const changed = harness([n('read', 7)], () => false); await changed.run({ ok: true, read_ids: [7] }); assert.deepEqual(changed.removed, []);
});
test('server event key correlates independently from numeric notification ID', async () => {
  const record = n('event', null); record.request.content.data.event_id = 'event-7';
  const h = harness([record]); await h.run({ ok: true, read_event_keys: ['event-7'] }); assert.deepEqual(h.removed, ['event']);
});
test('malformed confirmation preserves notifications safely', async () => {
  const h = harness([n('read', 7)]); await h.run({ ok: true, read_ids: {}, read_event_keys: 2 }); assert.deepEqual(h.removed, []);
});
