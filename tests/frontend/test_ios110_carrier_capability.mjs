import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');

test('новый iOS-клиент явно запрашивает каталог и сохраняет carrier cursor в реальных запросах', async () => {
  const requests = [];
  const code = babel.transformSync(readFileSync('src/utils/externalFreightFeed.js', 'utf8'), {
    babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = { exports: {} };
  const mocks = {
    'expo-constants': { expoConfig: { extra: {} } },
    '../config/env': { API_BASE: 'https://urtruck.kz/security/api/v1' },
    './storage': { storage: { get: async () => 'synthetic-session' } },
    './authEvents': { authedFetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ kind: 'vehicle', items: [], count: 1297 }) };
    } },
  };
  vm.runInNewContext(code, { module, exports: module.exports, process: { env: {} }, URLSearchParams,
    require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  await module.exports.externalFreightAPI.count();
  await module.exports.externalFreightAPI.list({ limit: 30, cursor: 'carrier:30', include_carriers: false });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(new URL(request.url).searchParams.get('include_carriers'), 'true');
    assert.equal(request.options.headers.Authorization, 'Bearer synthetic-session');
  }
  assert.equal(new URL(requests[1].url).searchParams.get('cursor'), 'carrier:30');
  assert.equal(new URL(requests[1].url).searchParams.get('limit'), '30');
});
