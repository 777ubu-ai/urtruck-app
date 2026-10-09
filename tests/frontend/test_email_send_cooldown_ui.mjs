import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/screens/onboarding/PhoneV2Screen.js', import.meta.url), 'utf8');
const start = source.indexOf('const submitEmail = async () => {');
const end = source.indexOf('  const SocialButton', start);
assert.ok(start >= 0 && end > start);
const handlerSource = source.slice(start, end);

async function submit(result) {
  const errors = [], routes = [], busy = [];
  const factory = new Function('emailOk', 'anyBusy', 'email', 'role', 'regAPI', 'setEmailBusy', 'setEmailError', 'navigation', 't', `${handlerSource}; return submitEmail;`);
  const handler = factory(true, false, 'fixture@example.com', 'driver',
    { sendEmailCode: async () => result }, (v) => busy.push(v), (v) => errors.push(v),
    { navigate: (...args) => routes.push(args) },
    (key) => key === 'prem_reg_cooldown_body' ? 'Wait {time}' : key);
  await handler();
  return { errors, routes, busy };
}

test('429 explains server wait instead of claiming delivery failed', async () => {
  const x = await submit({ sent: false, ok: false, cooldown: true, cooldown_sec: 52 });
  assert.equal(x.errors.at(-1), 'Wait 00:52');
  assert.equal(x.routes.length, 0);
  assert.deepEqual(x.busy, [true, false]);
});
test('hour limit displays the full server wait', async () => {
  const x = await submit({ cooldown: true, cooldown_sec: 3540 });
  assert.equal(x.errors.at(-1), 'Wait 59:00');
});
test('missing retry duration uses a safe minute fallback', async () => {
  const x = await submit({ cooldown: true, cooldown_sec: 'invalid' });
  assert.equal(x.errors.at(-1), 'Wait 01:00');
});
test('real delivery failure remains an error and does not open OTP', async () => {
  const x = await submit({ sent: false, error: 'email_auth_failed' });
  assert.equal(x.errors.at(-1), 'phone_v2_send_failed');
  assert.equal(x.routes.length, 0);
});
test('confirmed real delivery opens email OTP without exposing its code', async () => {
  const x = await submit({ sent: true, mock: false, code: 'fixture-code' });
  assert.equal(x.routes[0][0], 'OtpV2');
  assert.equal(x.routes[0][1].channel, 'email');
  assert.equal(x.routes[0][1].mockCode, null);
});
