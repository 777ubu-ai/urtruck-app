import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const apiSource = readFileSync('src/utils/notificationsAPI.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export const notificationsAPI', 'globalThis.notificationsAPI');
const screen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');
function api(response) {
  const ctx = { API_BASE: '/api', storage: { get: async () => 'test-token' }, fetch: async () => response };
  vm.runInNewContext(apiSource, ctx);
  return ctx.notificationsAPI;
}
for (const status of [401, 403, 429, 500]) test(`HTTP ${status} cannot confirm single/all read`, async () => {
  const a = api({ ok: false, status, json: async () => ({ detail: 'failure' }) });
  await assert.rejects(a.read(5)); await assert.rejects(a.readAll());
});
test('HTTP 200 without explicit ok is not a read acknowledgement', async () => {
  const a = api({ ok: true, status: 200, json: async () => ({}) });
  await assert.rejects(a.read(5)); await assert.rejects(a.readAll());
});
test('valid acknowledgement succeeds for single/all read', async () => {
  const a = api({ ok: true, status: 200, json: async () => ({ ok: true }) });
  assert.equal((await a.read(5)).ok, true); assert.equal((await a.readAll()).ok, true);
});
function handler(name, notificationsAPI) {
  const start = screen.indexOf(`  const ${name} = async`);
  const end = screen.indexOf(name === 'handlePress' ? '\n  const cleanNotifText' : '\n  const handlePress', start);
  let items = [{ id: 5, is_read: 0 }, { id: 6, is_read: 0 }];
  const calls = [];
  const ctx = { Date, dismissConfirmedNotifications: async () => {}, notificationsAPI, ownerRef: { current: 'owner-A' }, mountedRef: { current: true },
    toast: () => calls.push('toast'), t: k => k, notifyNotifRead: () => calls.push('read-event'),
    refreshAppIconBadge: async () => calls.push('badge'), load: () => calls.push('load'),
    setItems: fn => { items = fn(items); calls.push('items'); }, parseNotifUrl: () => null };
  vm.runInNewContext(screen.slice(start, end) + `\nglobalThis.handler = ${name};`, ctx);
  return { ctx, calls, items: () => items, run: () => ctx.handler({ id: 5, is_read: 0 }) };
}
for (const name of ['handlePress', 'markAllRead']) {
  test(`${name}: rejected read preserves unread and avoids false badge refresh`, async () => {
    const h = handler(name, { read: async () => { throw Error('offline'); }, readAll: async () => { throw Error('offline'); } });
    await h.run(); assert.deepEqual(h.calls, ['toast']); assert.equal(h.items()[0].is_read, 0);
  });
  test(`${name}: account switch during request cannot mutate new account UI`, async () => {
    let finish;
    const pending = new Promise(r => { finish = r; });
    const h = handler(name, { read: () => pending, readAll: () => pending });
    const result = h.run(); h.ctx.ownerRef.current = 'owner-B'; finish({ ok: true });
    await result; assert.deepEqual(h.calls, []); assert.equal(h.items()[0].is_read, 0);
  });
}
test('single read updates only its confirmed item and refreshes badge once', async () => {
  const h = handler('handlePress', { read: async () => ({ ok: true }) });
  await h.run(); assert.equal(h.items()[0].is_read, 1); assert.equal(h.items()[1].is_read, 0);
  assert.deepEqual(h.calls, ['items', 'read-event', 'badge']);
});
test('read-all signals and refreshes once after confirmed success', async () => {
  const h = handler('markAllRead', { readAll: async () => ({ ok: true }) });
  await h.run(); assert.deepEqual(h.calls, ['read-event', 'badge', 'toast', 'load']);
});
