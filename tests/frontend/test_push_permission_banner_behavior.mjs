import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';
import { createPushPermissionMonitor } from '../../src/utils/pushPermissionMonitor.js';

test('real denied web banner renders and its retry button refreshes permission', async () => {
  let checks = 0;
  let states = 0;
  const monitor = { refresh: async () => { checks++; } };
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useEffect() {}, useRef: () => ({ current: monitor }),
    useState: () => [states++ === 0 ? 'denied' : false, () => {}],
  };
  const imports = {
    react: React,
    'react-native': { AppState: {}, Platform: { OS: 'web' }, StyleSheet: { create: (s) => s },
      Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View' },
    '@expo/vector-icons/Feather': 'Feather',
    '../utils/push': { push: { isNative: () => false } },
    '../utils/pushPermissionMonitor': { createPushPermissionMonitor },
    '../utils/useI18n': { useI18n: () => ({ lang: 'RU' }) },
    '../theme/designV1': { useV1Colors: () => ({}) },
    '../utils/ThemeContext': { useTheme: () => ({ isDark: false }) },
  };
  const { code } = transform(readFileSync('src/components/PushPermissionBanner.js', 'utf8'), { transforms: ['jsx', 'imports'] });
  const exports = {};
  new Function('require', 'exports', code)((name) => {
    assert.ok(name in imports, `known import: ${name}`);
    return imports[name];
  }, exports);
  const tree = exports.default({ enabled: true });
  const action = tree.children.find((child) => child?.props?.testID === 'push-permission-enable');
  assert.ok(action);
  await action.props.onPress();
  assert.equal(checks, 1);
});

test('foreground during an old permission read queues a fresh OS read', async () => {
  let listener, resolveOld;
  let reads = 0;
  const observed = [];
  const monitor = createPushPermissionMonitor({
    appState: { addEventListener: (_name, fn) => { listener = fn; return { remove() {} }; } },
    getPermission: () => ++reads === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve('granted'),
    onPermission: (value) => observed.push(value), onGranted() {},
  });
  await Promise.resolve();
  const returned = listener('active');
  resolveOld('denied');
  await returned;
  assert.equal(reads, 2);
  assert.equal(observed.at(-1), 'granted');
  monitor.remove();
});
