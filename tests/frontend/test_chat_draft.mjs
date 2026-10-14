import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatDraft } from '../../src/utils/chatDraft.js';
const fixture = () => { const values = new Map(); return { values, storage: { get: async k => values.get(k), set: async (k, v) => values.set(k, v), remove: async k => values.delete(k) } }; };
test('draft survives remount and is isolated by account and room', async () => {
  const { storage } = fixture(); let a = createChatDraft(storage, 'u', 'r'); await a.connect(() => {}); await a.set('hello\nworld'); a.disconnect();
  a = createChatDraft(storage, 'u', 'r'); let restored; await a.connect(v => { restored = v; }); assert.equal(restored, 'hello\nworld');
  for (const [user, room] of [['other', 'r'], ['u', 'other']]) { let leaked = false; await createChatDraft(storage, user, room).connect(() => { leaked = true; }); assert.equal(leaked, false); }
});
test('late restore cannot replace new typing or update disconnected screen', async () => {
  let resolve; const storage = { get: () => new Promise(r => { resolve = r; }), set: async () => {}, remove: async () => {} };
  const a = createChatDraft(storage, 'u', 'r'); let restored = false; const read = a.connect(() => { restored = true; }); await a.set('new'); resolve('"old"'); await read; assert.equal(restored, false);
  const b = createChatDraft(storage, 'u', 'r'); const read2 = b.connect(() => { restored = true; }); b.disconnect(); resolve('"old"'); await read2; assert.equal(restored, false);
});
test('rapid edits stay ordered and send clears the persisted draft', async () => {
  const { storage, values } = fixture(); const a = createChatDraft(storage, 'u', 'r'); await a.connect(() => {});
  await Promise.all([a.set('1'), a.set('12'), a.set('123')]); assert.deepEqual([...values.values()], ['"123"']);
  await a.set(''); assert.equal(values.size, 0);
});
