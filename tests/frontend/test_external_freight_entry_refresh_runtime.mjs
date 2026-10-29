import * as localeHelpers from '../../src/utils/additionalLocales.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const code = babel.transformSync(readFileSync('src/components/externalFreight/ExternalFreightEntry.js', 'utf8'), {
  babelrc: false, configFile: false,
  plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
}).code;

function harness(role) {
  let calls = 0, elapsed = 0, focused = true, appCallback;
  const intervals = new Map(), listeners = new Map(), cleanups = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: current => ({ current }), useState: initial => [initial, () => {}],
    useEffect: fn => { cleanups.push(fn()); },
  };
  const AppState = { currentState: 'active', addEventListener: (_event, fn) => {
    appCallback = fn; return { remove() { appCallback = null; } };
  } };
  const navigation = { isFocused: () => focused, addListener: (event, fn) => {
    listeners.set(event, fn); return () => listeners.delete(event);
  } };
  const mocks = {
    '../utils/additionalLocales.js': localeHelpers, '../../utils/additionalLocales.js': localeHelpers,
    react: React,
    'react-native': { AppState, View: 'View', TouchableOpacity: 'TouchableOpacity', Text: 'Text', StyleSheet: { create: x => x } },
    '@expo/vector-icons/Feather': 'Feather',
    '../../theme/designV1': { useV1Colors: () => ({}), useDriverCeramicColors: () => ({}) },
    '../../utils/useI18n': { useI18n: () => ({ lang: 'RU' }) },
    '../../utils/AuthContext': { useAuth: () => ({ session: { user: { id: 'synthetic-' + role, role } } }) },
    '../../utils/externalFreightSession': { sessionRole: () => role },
    '../../utils/externalFreightFeed': { EXTERNAL_FREIGHT_ENABLED: true, externalFreightAPI: {
      async count() { calls++; return { ok: true, kind: role === 'driver' ? 'cargo' : 'vehicle', count: 42 }; },
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout, clearTimeout,
    require: name => { assert.ok(name in mocks, name); return mocks[name]; },
    setInterval: (fn, delay) => { intervals.set(fn, { delay, next: elapsed + delay }); return fn; },
    clearInterval: fn => intervals.delete(fn),
  });
  module.exports.default({ navigation, role });
  return {
    calls: () => calls,
    flush: () => new Promise(resolve => setImmediate(resolve)),
    advance(ms) {
      const end = elapsed + ms;
      while (intervals.size) {
        const next = Math.min(...[...intervals.values()].map(timer => timer.next));
        if (next > end) break;
        elapsed = next;
        for (const [fn, timer] of intervals) if (timer.next === next) { timer.next += timer.delay; fn(); }
      }
      elapsed = end;
    },
    app(state) { AppState.currentState = state; appCallback?.(state); },
    blur() { focused = false; listeners.get('blur')?.(); },
    focus() { focused = true; listeners.get('focus')?.(); },
    unmount() { cleanups.forEach(fn => fn?.()); },
  };
}

for (const role of ['driver', 'client']) test(`${role}: счётчик обновляется через минуту и сразу при возврате`, async () => {
  const h = harness(role); await h.flush(); assert.equal(h.calls(), 1);
  h.advance(59999); await h.flush(); assert.equal(h.calls(), 1);
  h.advance(1); await h.flush(); assert.equal(h.calls(), 2);
  for (const state of ['background', 'inactive']) {
    h.app(state); const before = h.calls();
    h.advance(120000); await h.flush(); assert.equal(h.calls(), before);
    h.app('active'); await h.flush(); assert.equal(h.calls(), before + 1);
  }
  h.blur(); const before = h.calls();
  h.advance(120000); await h.flush(); assert.equal(h.calls(), before);
  h.focus(); await h.flush(); assert.equal(h.calls(), before + 1);
  h.unmount(); h.advance(120000); await h.flush(); assert.equal(h.calls(), before + 1);
});
