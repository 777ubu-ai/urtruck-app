import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const project = new URL('../..', import.meta.url).pathname;
const invokeConfig = "const make=require('./app.config.js'); const config=make({config:{android:{},extra:{}}}); process.stdout.write(JSON.stringify(config.extra));";

function runConfig(env = {}) {
  return spawnSync('node', ['-e', invokeConfig], {
    cwd: project,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('QA2 build refuses missing API endpoint', () => {
  const result = runConfig({ URTRUCK_BUILD_FLAVOR: 'qa2', EXPO_PUBLIC_API_URL: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /isolated non-production QA API/);
});

test('QA2 build refuses production API endpoint', () => {
  const result = runConfig({ URTRUCK_BUILD_FLAVOR: 'qa2', EXPO_PUBLIC_API_URL: 'https://urtruck.kz/' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /isolated non-production QA API/);
});

test('QA2 build accepts an explicit non-production API endpoint', () => {
  const result = runConfig({ URTRUCK_BUILD_FLAVOR: 'qa2', EXPO_PUBLIC_API_URL: 'https://qa.example.invalid' });
  assert.equal(result.status, 0, result.stderr);
});

test('production Android build rejects a QA2 API override', () => {
  const result = runConfig({
    URTRUCK_BUILD_FLAVOR: 'production',
    EXPO_PUBLIC_API_URL: 'https://qa2.urtruck.kz',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production Android build must use https:\/\/urtruck\.kz/);
});

test('Google Play Internal accepts QA2 only after explicit opt-in', () => {
  const result = runConfig({
    URTRUCK_BUILD_FLAVOR: 'production',
    URTRUCK_QA2_INTERNAL_STORE: 'true',
    EXPO_PUBLIC_API_URL: 'https://qa2.urtruck.kz',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).urtruckApiUrl, 'https://qa2.urtruck.kz');
  assert.equal(JSON.parse(result.stdout).urtruckBuildFlavor, 'production');
});

test('Google Play Internal opt-in rejects non-exact QA2 endpoints', () => {
  for (const apiUrl of [
    'http://qa2.urtruck.kz',
    'https://other.example.invalid',
    'https://qa2.urtruck.kz:8443',
    'https://qa2.urtruck.kz/path',
  ]) {
    const result = runConfig({
      URTRUCK_BUILD_FLAVOR: 'production',
      URTRUCK_QA2_INTERNAL_STORE: 'true',
      EXPO_PUBLIC_API_URL: apiUrl,
    });
    assert.notEqual(result.status, 0, `${apiUrl} should be rejected`);
    assert.match(result.stderr, /QA2 Internal store build requires https:\/\/qa2\.urtruck\.kz/);
  }
});

test('production Android build pins the canonical API when no override is supplied', () => {
  const result = runConfig({
    EXPO_PUBLIC_API_URL: '',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).urtruckApiUrl, 'https://urtruck.kz');
  assert.equal(JSON.parse(result.stdout).urtruckBuildFlavor, 'production');
});

test('production Android build accepts and canonicalizes the production API', () => {
  const result = runConfig({
    URTRUCK_BUILD_PLATFORM: 'android',
    URTRUCK_BUILD_FLAVOR: 'production',
    EXPO_PUBLIC_API_URL: 'https://urtruck.kz/',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).urtruckApiUrl, 'https://urtruck.kz');
});

test('isolated QA2 Android build still accepts its explicit QA API', () => {
  const result = runConfig({
    URTRUCK_BUILD_PLATFORM: 'android',
    URTRUCK_BUILD_FLAVOR: 'qa2',
    EXPO_PUBLIC_API_URL: 'https://qa2.urtruck.kz',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).urtruckApiUrl, 'https://qa2.urtruck.kz');
  assert.equal(JSON.parse(result.stdout).urtruckBuildFlavor, 'qa2');
});
