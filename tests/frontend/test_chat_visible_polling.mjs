import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const callback = source.slice(source.indexOf('      if (!roomId) return undefined;', source.indexOf('// GET /messages')), source.indexOf('    }, [roomId, loadMessages]),', source.indexOf('// GET /messages')));
const guard = source.slice(source.indexOf('    if (!roomId || !chatFocusedRef'), source.indexOf('    // Один poll'));
function fixture(state = 'active') {
  const chatFocusedRef = { current: false }, chatAppActiveRef = { current: false };
  const AppState = { currentState: state, addEventListener: (_name, fn) => { listener = fn; return { remove() { removed++; } }; } };
  let listener, interval, removed = 0, cleared = 0, reads = 0;
  const rooms = [];
  const roomId = 'room-a';
  const loadMessages = new Function('roomId', 'chatFocusedRef', 'chatAppActiveRef', 'read', `${guard}read();`).bind(null, roomId, chatFocusedRef, chatAppActiveRef, () => reads++);
  const enter = new Function('roomId', 'chatFocusedRef', 'chatAppActiveRef', 'AppState', 'setActiveRoom', 'loadMessages', 'setInterval', 'clearInterval', callback);
  return { enter: () => enter(roomId, chatFocusedRef, chatAppActiveRef, AppState, room => rooms.push(room), loadMessages, fn => { interval = fn; return 1; }, () => cleared++), poll: () => interval(), event: state => listener(state), stats: () => ({ reads, rooms, removed, cleared }), loadMessages };
}
test('visible chat reads, blur cancels poll and delayed callbacks cannot read', () => {
  const f = fixture(); const leave = f.enter(); f.poll();
  assert.equal(f.stats().reads, 2); leave(); f.poll(); f.loadMessages();
  assert.equal(f.stats().reads, 2); assert.equal(f.stats().removed, 1); assert.equal(f.stats().cleared, 1); assert.equal(f.stats().rooms.at(-1), null);
});
test('background does not read or suppress push; foreground reloads focused room', () => {
  const f = fixture(); f.enter(); f.event('background'); f.poll();
  assert.equal(f.stats().reads, 1); assert.equal(f.stats().rooms.at(-1), null);
  f.event('active'); assert.equal(f.stats().reads, 2); assert.equal(f.stats().rooms.at(-1), 'room-a');
});
test('focus acquired in background waits for foreground', () => {
  const f = fixture('background'); f.enter(); f.poll(); assert.equal(f.stats().reads, 0);
  f.event('active'); assert.equal(f.stats().reads, 1);
});
