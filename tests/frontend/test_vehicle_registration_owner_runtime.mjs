// Исполняет целые AuthProvider и VehicleSetupSuccessScreen с отложенным транспортом.
// Регрессия запускается каноническим frontend test runner из корня репозитория.
import fs from 'node:fs';
import vm from 'node:vm';
import * as localeHelpers from '../../src/utils/additionalLocales.js';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const requireLocal = createRequire(process.cwd() + '/package.json');
const sucrase = requireLocal('sucrase');
const saved = new Map();
const state = [], refs = [];
let cursor = 0, refCursor = 0;
const authReact = {
  createContext: () => ({ Provider: 'Provider' }),
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  },
  useRef: value => refs[refCursor++] ||= { current: value },
  useEffect: () => {}, useCallback: fn => fn, useContext: () => null,
};
function load(path, req) {
  const exports = {};
  vm.runInNewContext(sucrase.transform(fs.readFileSync(path, 'utf8'), {
    transforms: ['jsx', 'imports'],
  }).code, { exports, require: req, console, setTimeout, clearTimeout, AbortController });
  return exports;
}
const mutations = load('src/utils/authMutation.js', () => ({}));
const storage = {
  set: async (key, value) => saved.set(key, value),
  get: async key => saved.get(key),
  remove: async key => saved.delete(key),
};
let resolveOld;
const regAPI = {
  getToken: async () => saved.get('ur_reg_token'),
  me: async () => null,
  completeBasic: () => new Promise(resolve => { resolveOld = resolve; }),
};
const req = name => name === 'react' ? { __esModule: true, default: authReact, ...authReact }
  : name === './storage' ? { storage }
  : name === './authMutation' ? mutations
  : name === './registration' ? { regAPI } : {};
const auth = load('src/utils/AuthContext.js', req).AuthProvider({ children: null }).props.value;
await auth.signIn('a@example.test', 1, 'synthetic-a', { userId: 'account-a' });
const effects = [];
const screenReact = {
  ...authReact, useState: value => [value, () => {}],
  useRef: value => ({ current: value }), useEffect: fn => effects.push(fn),
};
const generic = { __esModule: true, default: 'Component' };
const screenReq = name => name === 'react' ? { __esModule: true, default: screenReact, ...screenReact }
  : name === 'react-native' ? { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View' }
  : name === 'react-native-safe-area-context' ? { SafeAreaView: 'SafeAreaView' }
  : name.endsWith('/additionalLocales.js') ? localeHelpers
  : name.endsWith('/AuthContext') ? { useAuth: () => auth }
  : name.endsWith('/registration') ? { regAPI }
  : name.endsWith('/useI18n') ? { useI18n: () => ({ lang: 'RU' }) }
  : name.endsWith('/VehicleSetupUI') ? { useVehicleSetupStyles: () => ({}), useVehicleCopy: () => ({ c: {} }) }
  : name.endsWith('/designV1') ? { useDriverCeramicColors: () => ({}) } : generic;
load('src/screens/vehicle/VehicleSetupSuccessScreen.js', screenReq).default({
  navigation: {}, route: { params: { origin: 'basic_onboarding' } },
});
const cleanups = effects.map(fn => fn());
// Даём обработчику дойти до отложенного запроса и затем размонтируем экран.
await new Promise(resolve => setImmediate(resolve));
assert.equal(typeof resolveOld, 'function');
cleanups.forEach(fn => fn?.());
await auth.signIn('b@example.test', 1, 'synthetic-b', { userId: 'account-b' });
await auth.setRole('client');
resolveOld({ ok: true });
await new Promise(resolve => setImmediate(resolve));
const session = JSON.parse(saved.get('ur_session'));
const expected = 'client';
assert.equal(session.user.id, 'account-b');
assert.equal(saved.get('ur_reg_token'), 'synthetic-b');
assert.equal(session.user.role, expected);
console.log(JSON.stringify({ old_screen_unmounted: true, account_b_role: session.user.role, expected_role: expected }));

// Выполняем сам обработчик Country, включая оба await и проверку владельца.
const { default: test } = await import('node:test');
const countrySource = fs.readFileSync('src/screens/vehicle/VehicleSetupCountryScreen.js', 'utf8');
const saveSource = countrySource.slice(countrySource.indexOf('  const save = async'), countrySource.indexOf('\n  const input ='));
function countryHarness({ deferred = false } = {}) {
  const calls = [], token = { value: 'A' };
  let resolveVehicle;
  const ctx = {
    savingRef: { current: false }, mountedRef: { current: true }, incomplete: false,
    setSaving: () => {}, setError: value => { if (value) calls.push(['error', value]); },
    draft: { make: 'Volvo', model: 'FH', license_plate: 'QA123', payload_tons: 20, cargo_volume_m3: 86 },
    c: { saveError: 'save', saveErrorSub: 'network' }, route: { params: {} },
    regAPI: { getToken: async () => token.value, saveDriverDraft: async (_, owner) => {
      calls.push(['draft', owner.expectedToken]);
      return { ok: owner.expectedToken === token.value && owner.isCurrent() };
    } },
    vehicleAPI: { save: async (_, __, owner) => {
      calls.push(['vehicle', owner.expectedToken]);
      return deferred ? new Promise(resolve => { resolveVehicle = resolve; }) : { ok: true, vehicle: { id: 'vehicle-a' } };
    } },
    handleAuthFailure: () => false,
    navigation: { replace: name => calls.push(['navigate', name]) },
  };
  vm.runInNewContext(saveSource + '\nglobalThis.save = save;', ctx);
  return { ctx, calls, token, finish: value => resolveVehicle(value) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('обычное сохранение машины продолжает черновик и завершение той же сессии', async () => {
  const h = countryHarness(); await h.ctx.save();
  assert.deepEqual(h.calls, [['vehicle', 'A'], ['draft', 'A'], ['navigate', 'VehicleSetupSuccess']]);
});
for (const change of ['token', 'unmount']) {
  test(`старый vehicle-ответ после ${change} не пишет черновик и не открывает Success`, async () => {
    const h = countryHarness({ deferred: true }); const pending = h.ctx.save(); await flush();
    if (change === 'token') h.token.value = 'B'; else h.ctx.mountedRef.current = false;
    h.finish({ ok: true, vehicle: { id: 'vehicle-a' } }); await pending;
    assert.deepEqual(h.calls, [['vehicle', 'A']]);
  });
}
test('повторное нажатие до ответа не создаёт вторую машину', async () => {
  const h = countryHarness({ deferred: true }); const pending = h.ctx.save(); await h.ctx.save(); await flush();
  assert.equal(h.calls.length, 1); h.finish({ ok: true, vehicle: {} }); await pending;
  assert.equal(h.calls.filter(([name]) => name === 'vehicle').length, 1);
});
