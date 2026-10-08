import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

// Выполняем настоящие effect callbacks, не копию badge-логики.
const source = readFileSync(new URL('../../src/components/ui/v1/BottomNav.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const component = ast.program.body.find((node) => node.type === 'ExportDefaultDeclaration').declaration;
const callbacks = component.body.body.filter((node) =>
  node.type === 'ExpressionStatement' && node.expression?.callee?.name === 'useEffect'
).map((node) => node.expression.arguments[0]);
assert.equal(callbacks.length, 2);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness(refreshAppIconBadge, initial = 3, hasToken = true) {
  const state = { count: initial, writes: [], clears: 0 };
  let onRead;
  const scope = {
    hasToken, refreshAppIconBadge,
    setDealsUnread: (value) => { state.count = value; state.writes.push(value); },
    clearAppIconBadge: () => { state.clears += 1; },
    pollTimer: { current: null }, UNREAD_POLL_MS: 12000,
    setInterval: () => 1, clearInterval: () => {},
    AppState: { addEventListener: () => ({ remove() {} }) },
    subscribeChatRead: (callback) => { onRead = callback; return () => {}; },
  };
  return {
    state, read: () => onRead(),
    effect: (index) => new Function(...Object.keys(scope),
      'return (' + source.slice(callbacks[index].start, callbacks[index].end) + ')();'
    )(...Object.values(scope)),
  };
}
test('late poll cannot restore the tab count after a newer successful read', async () => {
  const old = deferred(), fresh = deferred();
  let calls = 0;
  const h = harness(() => (++calls === 1 ? old.promise : fresh.promise));
  const cleanup = h.effect(0);
  h.read();
  fresh.resolve({ badge: 0, applied: true, reason: null });
  await tick();
  old.resolve({ badge: 8, applied: false, reason: 'superseded' });
  await tick();
  assert.equal(h.state.count, 0);
  cleanup();
});
test('native rejection of an obsolete snapshot cannot replace the in-app count', async () => {
  const p = deferred();
  const h = harness(() => p.promise);
  const cleanup = h.effect(0);
  p.resolve({ badge: 12, applied: false, reason: 'superseded' });
  await tick();
  assert.equal(h.state.count, 0, 'new scope is empty until a current result');
  cleanup();
});
test('notification-triggered refresh also rejects superseded values', async () => {
  const p = deferred();
  const h = harness(() => p.promise);
  const cleanup = h.effect(1);
  p.resolve({ badge: 12, applied: false, reason: 'superseded' });
  await tick();
  assert.equal(h.state.count, 3);
  cleanup?.();
});
test('pending callbacks after cleanup cannot update a former account or unmounted tab', async () => {
  for (const index of [0, 1]) {
    const p = deferred();
    const h = harness(() => p.promise);
    const cleanup = h.effect(index);
    cleanup?.();
    const before = h.state.writes.length;
    p.resolve({ badge: 9, applied: true, reason: null });
    await tick();
    assert.equal(h.state.writes.length, before);
  }
});
test('unsupported launcher still shows the current canonical count inside the app', async () => {
  for (const index of [0, 1]) {
    const h = harness(async () => ({ badge: 6, applied: false, reason: 'launcher_badge_unsupported' }));
    const cleanup = h.effect(index);
    await tick();
    assert.equal(h.state.count, 6);
    cleanup?.();
  }
});
test('signed-out tab clears its count without requesting unread', () => {
  const h = harness(() => { throw Error('must not fetch'); }, 8, false);
  h.effect(0);
  assert.equal(h.state.count, 0);
  assert.equal(h.state.clears, 1);
});
