import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'sucrase';

function load({key = 'test-token', host = 'https://example.invalid'} = {}) {
  const records = [];
  class FakePostHog {
    constructor(token, options) { records.push({ token, options }); }
    capture(event, properties) { records.push({ event, properties }); }
  }
  const source = readFileSync('src/utils/authObservability.js', 'utf8');
  const code = transform(source, { transforms: ['imports'] }).code;
  const mod = { exports: {} };
  const context = { module: mod, exports: mod.exports, process: { env: {
    EXPO_PUBLIC_POSTHOG_KEY: key, EXPO_PUBLIC_POSTHOG_HOST: host,
  }}, require(name) {
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'posthog-react-native') return { __esModule: true, default: FakePostHog };
    throw new Error(name);
  }};
  vm.runInNewContext(code, context);
  return { track: mod.exports.trackAuth, records };
}
test('Без настроек аналитика не отправляет события', () => {
  const { track, records } = load({ key: '', host: '' });
  track('auth_screen_opened');
  assert.equal(records.length, 0);
});
test('События пропускают только утверждённые свойства', () => {
  const { track, records } = load();
  track('auth_social_stage', { method: 'google', stage: 'backend_verify_failed',
    code: 'NETWORK_UNAVAILABLE', status: 503, email: 'private@example.org',
    phone: '+70000000000', token: 'secret', otp: '1234' });
  const sent = JSON.parse(JSON.stringify(records[1]));
  assert.deepEqual(sent, { event: 'auth_social_stage', properties: {
    method: 'google', stage: 'backend_verify_failed', code: 'NETWORK_UNAVAILABLE', status: 503,
  }});
  track('unknown_event', { email: 'private@example.org' });
  assert.equal(records.length, 2);
  assert.equal(records[0].options.enableSessionReplay, false);
});
