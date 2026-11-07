import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/screens/CargoDetail.js', 'utf8');
const start = source.indexOf('  const onDeleteCargo = () => {');
const end = source.indexOf('\n  // changeDealStatus', start);
assert.ok(start >= 0 && end > start);
function fixture(readOnly, status = 'active', confirmed = true) {
  const events = [];
  const c = { id: 'fixture-owned-cargo', _server: true, status };
  const env = { readOnly, c, marketAPI: { deleteCargo: async () => { events.push('server-delete'); c.status = 'cancelled'; return { ok: true }; } },
    removeCargo: () => events.push('local-delete'), toast: () => events.push('toast'), t: key => key,
    navigation: { goBack: () => events.push('back') }, askConfirm: async () => { events.push('confirm'); return confirmed; } };
  const action = new Function(...Object.keys(env), source.slice(start, end) + '\nreturn onDeleteCargo;')(...Object.values(env));
  return { action, events, c };
}
const settled = () => new Promise(resolve => setImmediate(resolve));
test('история грузов не запрашивает удаление и сохраняет каждый исходный статус', async () => {
  for (const status of ['expired', 'unpublished', 'rejected', 'cancelled', 'taken', 'completed', 'active']) {
    const f = fixture(true, status); f.action(); await settled();
    assert.deepEqual(f.events, [], status);
    assert.equal(f.c.status, status);
  }
});
test('обычный активный груз остаётся управляемым владельцем после подтверждения', async () => {
  const f = fixture(false); f.action(); await settled();
  assert.deepEqual(f.events, ['confirm', 'server-delete', 'toast', 'back']);
});
test('отмена подтверждения не меняет обычное активное объявление', async () => {
  const f = fixture(false, 'active', false); f.action(); await settled();
  assert.deepEqual(f.events, ['confirm']); assert.equal(f.c.status, 'active');
});
test('кнопка удаления в detail учитывает readOnly истории', () => {
  assert.match(source, /\{!readOnly && c\.isMine && !chatRoomId && \(/);
});
