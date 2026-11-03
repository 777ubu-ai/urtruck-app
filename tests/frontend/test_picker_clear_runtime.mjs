import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createPickerSearchScheduler } from '../../src/utils/pickerSearchScheduler.js';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const source = readFileSync('src/components/LocationPickerModal.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export default function', 'function');
const code = babel.transformSync(source, { babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-react-jsx')] }).code;
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
 let cursor = 0, effectCursor = 0, timerId = 0, visible = true;
 const values = [], effects = [], timers = new Map();
 const hooks = {
  useState: initial => { const n = cursor++; if (!(n in values)) values[n] = initial; return [values[n], value => { values[n] = value; }]; },
  useRef: initial => { const n = cursor++; return values[n] ??= { current: initial }; },
  useMemo: fn => fn(),
  useEffect: (fn, deps) => { const n = effectCursor++, old = effects[n]; if (old && deps.every((d, i) => Object.is(d, old.deps[i]))) return; old?.cleanup?.(); effects[n] = { fn, deps }; },
 };
 // useMemo сохраняет scheduler, как React: его generation — часть проверяемого контракта.
 hooks.useMemo = (fn, deps) => { const n = cursor++, old = values[n]; if (old && deps.every((d, i) => Object.is(d, old.deps[i]))) return old.value; const value = fn(); values[n] = { deps, value }; return value; };
 const scope = { ...hooks, React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
  AppState: { currentState: 'active' }, Constants: {}, performance, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  GPS_TRACKING_PAUSED: true, COUNTRIES: { KZ: { name: 'Казахстан' } }, COUNTRY_ORDER: ['KZ'], POINTS: [],
  useV1Colors: () => ({ bg: '#fff' }), useI18n: () => ({ lang: 'RU', t: value => value }),
  StyleSheet: { create: value => value }, v1Radius: {}, storage: { get: async () => null, set: async () => {} },
  localizePlace: value => value, getCountryName: value => value, pointsForCountry: () => [], searchPointsAsync: async () => [],
  locationScopeAllowsPoint: () => true, customCityForCountry: name => ({ name, country: 'XX', type: 'city' }),
  createPickerSearchScheduler: () => createPickerSearchScheduler({ scheduleTimer: cb => { const id = ++timerId; timers.set(id, cb); return id; }, cancelTimer: id => timers.delete(id) }),
 };
 for (const name of ['Modal', 'View', 'Text', 'TextInput', 'TouchableOpacity', 'ScrollView', 'FlatList', 'ActivityIndicator', 'SafeAreaView', 'SafeAreaProvider', 'Feather', 'CountryFlag']) scope[name] = name;
 const component = vm.runInNewContext(code + '\nLocationPickerModal;', scope);
 let tree;
 const render = () => { cursor = 0; effectCursor = 0; tree = component({ visible, onClose: () => {} }); for (const effect of effects) if (effect.fn) { const fn = effect.fn; effect.fn = null; effect.cleanup = fn(); } return tree; };
 const find = (type, node = tree) => { if (!node || typeof node !== 'object') return null; if (node.type === type) return node; for (const child of [node.children || []].flat(2)) { if (!child || typeof child !== 'object') continue; const found = find(type, child); if (found) return found; } return null; };
 render(); render();
 return { render, find, timers, input: text => find('TextInput').props.onChangeText(text), run: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(cb => cb()); }, close: () => { visible = false; render(); } };
}
test('очистка сразу обновляет поле; страны с флагами возвращаются отдельной подсказкой', async () => {
 const h = fixture(); await tick();
 h.input('Нью Йорк '); h.render(); h.run(); await tick(); h.render();
 assert.equal(h.find('TextInput').props.value, 'Нью Йорк ');
 h.input(''); h.render();
 assert.equal(h.find('TextInput').props.value, '');
 assert.equal(h.find('FlatList').props.data[0].type, 'loading');
 assert.equal(h.find('FlatList').props.data.some(row => row.type === 'country'), false);
 h.run(); await tick(); h.render();
 assert.equal(h.find('FlatList').props.data.some(row => row.type === 'country'), true);
});
test('новый ввод и закрытие отменяют отложенное восстановление старого списка', async () => {
 const h = fixture(); await tick();
 h.input('Москва'); h.render(); h.input(''); h.render();
 const old = [...h.timers.values()]; h.input('北京 '); h.render(); old.forEach(cb => cb());
 assert.equal(h.find('TextInput').props.value, '北京 ');
 assert.equal(h.find('FlatList').props.data.some(row => row.type === 'country'), false);
 h.close(); assert.equal(h.timers.size, 0); old.forEach(cb => cb());
 assert.equal(h.find('TextInput'), null);
});
