import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const project = new URL('../..', import.meta.url).pathname;
const invokeConfig = "const make=require('./app.config.js'); make({config:{android:{},extra:{}}});";

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
