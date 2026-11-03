import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const tick = () => new Promise(resolve => setImmediate(resolve));
const panel = readFileSync('src/components/TripRoutePanel.js', 'utf8');
const effects = [];
function walk(node) {
 if (!node || typeof node !== 'object') return;
 if (node.type === 'CallExpression' && node.callee?.object?.name === 'React' && node.callee?.property?.name === 'useEffect') effects.push(node.arguments[0]);
 for (const v of Object.values(node)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
}
walk(parse(panel, { sourceType: 'module', plugins: ['jsx'] }));
const weather = effects.find(node => panel.slice(node.start, node.end).includes('getLastKnownPositionAsync'));
function weatherHarness(paused = true) {
 const calls = []; const listeners = new Set();
 const app = { currentState: 'active', addEventListener: (_, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; } };
 const location = {
  getForegroundPermissionsAsync: async () => { calls.push('permission'); return { status: 'granted' }; },
  getLastKnownPositionAsync: async () => { calls.push('position'); return { coords: { latitude: 43, longitude: 76 } }; },
  reverseGeocodeAsync: async () => { calls.push('geocode'); return [{ city: 'city' }]; },
 };
 const scope = { GPS_TRACKING_PAUSED: paused, role: 'driver', lang: 'RU', AppState: app, Location: location,
  AbortController, setTimeout, clearTimeout, encodeURIComponent, Number, Math,
  fetch: async () => { calls.push('network'); return { ok: true, json: async () => ({ current: { temperature_2m: 5, weather_code: 0 } }) }; },
  weatherLabel: () => 'weather', setLiveWeather: () => calls.push('render'),
 };
 const mount = vm.runInNewContext('(' + panel.slice(weather.start, weather.end) + ')', scope);
 return { calls, location, mount, background: () => { app.currentState = 'background'; for (const cb of [...listeners]) cb('background'); } };
}
test('пауза блокирует даже чтение старой позиции и передачу координат погодному сервису', async () => {
 const h = weatherHarness(); h.mount(); await tick(); h.background(); await tick();
 assert.deepEqual(h.calls, []);
});
test('сворачивание во время ожидания разрешения не запускает следующий location API', async () => {
 const h = weatherHarness(false); let finish;
 h.location.getForegroundPermissionsAsync = () => { h.calls.push('permission'); return new Promise(resolve => { finish = resolve; }); };
 h.mount(); h.background(); finish({ status: 'granted' }); await tick();
 assert.deepEqual(h.calls, ['permission']);
});
test('закрытие панели во время ожидания позиции не отправляет поздние координаты', async () => {
 const h = weatherHarness(false); let finish;
 h.location.getLastKnownPositionAsync = () => { h.calls.push('position'); return new Promise(resolve => { finish = resolve; }); };
 const cleanup = h.mount(); await tick(); cleanup(); finish({ coords: { latitude: 43, longitude: 76 } }); await tick();
 assert.deepEqual(h.calls, ['permission', 'position']);
});
test('корень приложения очищает legacy-регистрацию до входа и без изменения навигации', () => {
 const source = readFileSync('App.js', 'utf8');
 const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
 const node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'App');
 const code = babel.transformSync(source.slice(node.start, node.end), { babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-react-jsx')] }).code;
 const calls = [];
 const scope = { useEffect: cb => cb(), initializeLocationPolicy: () => calls.push('stop'), sweepPrivatePdfCache: () => {}, sweepNativeAttachmentStaging: () => {}, React: { createElement: () => ({}) },
  AndroidBrandedLaunchSplash: 'splash', ErrorBoundary: 'boundary', ThemeProvider: 'theme', AuthProvider: 'auth', AppInner: 'inner' };
 vm.runInNewContext(code + '\nApp();', scope);
 assert.deepEqual(calls, ['stop']);
});
