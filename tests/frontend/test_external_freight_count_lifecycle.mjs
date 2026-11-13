import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(readFileSync('src/components/externalFreight/ExternalFreightEntry.js', 'utf8'), {
  babelrc: false, configFile: false,
  plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
}).code;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(role = 'driver') {
  let slots = [], cursor = 0, effects = [], dirty = true, tree, calls = 0, now = 0, serial = 0;
  let user = 'one', focused = true, appCallback, reply = { ok: true, kind: role === 'driver' ? 'cargo' : 'vehicle', count: 42 };
  const timers = new Map(), listeners = new Map();
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; dirty = true; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { appCallback = fn; return { remove() { appCallback = null; } }; } };
  const navigation = { isFocused: () => focused, addListener: (event, fn) => { listeners.set(event, fn); return () => listeners.delete(event); } };
  const mocks = {
    react: React, 'react-native': { AppState, View: 'View', TouchableOpacity: 'TouchableOpacity', Text: 'Text', StyleSheet: { create: x => x } },
    '@expo/vector-icons/Feather': 'Feather', '../../theme/designV1': { useV1Colors: () => ({}), useDriverCeramicColors: () => ({}) },
    '../../utils/useI18n': { useI18n: () => ({ lang: 'RU', t: x => x }) },
    '../../utils/AuthContext': { useAuth: () => ({ session: { user: { id: user, role } } }) },
    '../../utils/externalFreightSession': { sessionRole: () => role },
    '../../utils/additionalLocales.js': { withAdditionalLanguageTree: x => x },
    '../../utils/externalFreightFeed': { EXTERNAL_FREIGHT_ENABLED: true, externalFreightAPI: { count(signal) { calls++; return typeof reply === 'function' ? reply(signal) : Promise.resolve(reply); } } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, Date: { now: () => now },
    require: name => { assert.ok(name in mocks, name); return mocks[name]; },
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
  });
  function render() { if (!dirty) return; cursor = 0; dirty = false; tree = module.exports.default({ navigation, role }); effects.splice(0).forEach(fn => fn()); }
  function nodes() { const out = []; const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (!n?.props) return; out.push(n); walk(n.props.children); }; walk(tree); return out; }
  function unmount() { slots.forEach(s => s.cleanup?.()); slots = []; }
  const h = {
    render, calls: () => calls, count: () => nodes().find(n => n.props.testID === 'external-freight-count')?.props.children.join(''),
    failed: () => nodes().some(n => n.props.name === 'alert-circle'),
    setReply(value) { reply = value; },
    async flush() { for (let i = 0; i < 5; i++) { render(); await tick(); } },
    async advance(ms) { const end = now + ms; for (;;) { const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); await h.flush(); } now = end; await h.flush(); },
    focus() { focused = true; listeners.get('focus')?.(); }, blur() { focused = false; listeners.get('blur')?.(); },
    app(state) { AppState.currentState = state; appCallback?.(state); },
    user(id) { user = id; dirty = true; },
    remount() { unmount(); dirty = true; render(); }, unmount,
  };
  return h;
}
for (const role of ['driver', 'client']) test(`${role}: visible loading, bounded automatic recovery without navigating`, async () => {
  const h = harness(role); h.setReply({ ok: false, status: 503 }); h.render(); assert.equal(h.count(), '…');
  await h.flush(); assert.equal(h.count(), '—'); assert.ok(h.failed());
  await h.advance(2000); assert.equal(h.calls(), 2);
  h.setReply({ ok: true, kind: role === 'driver' ? 'cargo' : 'vehicle', count: 1359 });
  await h.advance(5000); assert.equal(h.calls(), 3); assert.equal(h.count(), '1 359'); assert.equal(h.failed(), false);
  await h.advance(600000); assert.equal(h.calls(), 3); h.unmount();
});
test('remount and network failure preserve last successful count; new response replaces it', async () => {
  const h = harness(); await h.flush(); assert.equal(h.count(), '42');
  let resolve; h.setReply(() => new Promise(r => { resolve = r; })); h.remount(); assert.equal(h.count(), '42');
  resolve({ ok: false, error: 'network_error' }); await h.flush(); assert.equal(h.count(), '42'); assert.ok(h.failed());
  h.setReply({ ok: true, kind: 'cargo', count: 43 }); await h.advance(2000); assert.equal(h.count(), '43'); assert.equal(h.failed(), false); h.unmount();
});
test('prolonged failures retry at most once per minute and stop in background', async () => {
  const h = harness(); h.setReply({ ok: false, status: 503 }); await h.flush();
  await h.advance(7000); assert.equal(h.calls(), 3);
  await h.advance(120000); assert.equal(h.calls(), 5);
  h.app('background'); await h.advance(600000); assert.equal(h.calls(), 5);
  h.setReply({ ok: true, kind: 'cargo', count: 0 }); h.app('active'); await h.flush(); assert.equal(h.count(), '0'); h.unmount();
});
test('blur and unmount cancel pending retries', async () => {
  const h = harness(); h.setReply({ ok: false, status: 503 }); await h.flush(); h.blur(); await h.advance(9000); assert.equal(h.calls(), 1);
  h.focus(); await h.flush(); assert.equal(h.calls(), 2); h.unmount(); await h.advance(9000); assert.equal(h.calls(), 2);
});
test('timeout recovers automatically, late cancelled response cannot overwrite newer value', async () => {
  const h = harness(); let resolve;
  h.setReply(signal => new Promise((res, rej) => { resolve = res; signal.addEventListener('abort', () => rej(new Error('aborted'))); }));
  await h.flush(); await h.advance(8000); assert.equal(h.count(), '—');
  h.setReply({ ok: true, kind: 'cargo', count: 77 }); await h.advance(2000); assert.equal(h.count(), '77');
  resolve({ ok: true, kind: 'cargo', count: 1 }); await h.flush(); assert.equal(h.count(), '77'); h.unmount();
});
test('account change hides old count and discards outstanding response', async () => {
  const h = harness(); await h.flush(); let resolve;
  h.setReply(() => new Promise(r => { resolve = r; })); h.focus(); await h.flush(); const oldResolve = resolve;
  h.user('two'); h.render(); assert.equal(h.count(), '…');
  oldResolve({ ok: true, kind: 'cargo', count: 900 }); await h.flush(); assert.equal(h.count(), '…');
  resolve({ ok: true, kind: 'cargo', count: 19 }); await h.flush(); assert.equal(h.count(), '19'); h.unmount();
});
for (const status of [401, 403]) test(`${status}: clears cached count without retry loop`, async () => {
  const h = harness(); await h.flush(); h.setReply({ ok: false, status }); h.focus(); await h.flush(); assert.equal(h.count(), '—');
  await h.advance(60000); assert.equal(h.calls(), 2); h.remount(); assert.equal(h.count(), '…'); h.unmount();
});
test('expired memory snapshot is not presented as a current count', async () => {
  const h = harness(); await h.flush(); await h.advance(300001); h.setReply(() => new Promise(() => {})); h.remount(); assert.equal(h.count(), '…'); h.unmount();
});

for (const role of ['driver', 'client']) test(`${role}: recovers from a prolonged outage without opening the feed`, async () => {
  const h = harness(role);
  h.setReply({ ok: false, status: 503 });
  await h.flush();
  await h.advance(7000);
  assert.equal(h.calls(), 3);
  h.setReply({ ok: true, kind: role === 'driver' ? 'cargo' : 'vehicle', count: 42 });
  await h.advance(60000);
  assert.equal(h.calls(), 4);
  assert.equal(h.count(), '42');
  h.unmount();
});
