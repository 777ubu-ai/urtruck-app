import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildExternalFreightShare } from '../../src/utils/externalFreightShare.js';

const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(readFileSync('src/config/env.js', 'utf8'), {
  babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-modules-commonjs')],
}).code;
function nativeEnv(extra, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, URL, __DEV__: false, process: { env },
    require: name => name === 'react-native' ? { Platform: { OS: 'ios' } } : { expoConfig: { extra } },
  });
  return module.exports;
}

test('локальная production-сборка без EAS profile сохраняет Share через фактический config API', () => {
  const env = nativeEnv({ urtruckApiUrl: 'https://urtruck.kz', urtruckBuildFlavor: 'production' });
  assert.equal(env.PUBLIC_WEB_ORIGIN, 'https://urtruck.kz');
  for (const kind of ['cargo', 'vehicle']) assert.ok(buildExternalFreightShare(
    { kind, status: 'active' }, { origin: env.PUBLIC_WEB_ORIGIN }));
});

test('QA2 native config формирует только QA2 share, локальный и чужой API не становятся публичными', () => {
  assert.equal(nativeEnv({ urtruckApiUrl: 'https://qa2.urtruck.kz' }).PUBLIC_WEB_ORIGIN, 'https://qa2.urtruck.kz');
  for (const api of ['http://localhost:8002', 'https://evil.test', 'https://urtruck.kz.evil.test']) {
    assert.equal(nativeEnv({ urtruckApiUrl: api }).PUBLIC_WEB_ORIGIN, '');
  }
  assert.equal(nativeEnv({ urtruckApiUrl: 'https://urtruck.kz' }, {
    EXPO_PUBLIC_API_URL: 'https://qa2.urtruck.kz',
  }).PUBLIC_WEB_ORIGIN, 'https://qa2.urtruck.kz');
});
