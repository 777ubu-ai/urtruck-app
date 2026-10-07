import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/utils/registration.js', 'utf8');
const apiBody = api.split('async sendEmailCode(email, extra = {}) {')[1].split('\n  },\n\n  async verifyEmailCode')[0];
const screen = readFileSync('src/screens/onboarding/PhoneV2Screen.js', 'utf8');
const submitBody = screen.split('const submitEmail = async () => {')[1].split('\n  };\n\n  const SocialButton')[0];

function realSend(status, payload, malformed = false) {
  const fetch = async () => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => { if (malformed) throw new Error('invalid JSON'); return payload; },
  });
  return new Function('fetch', 'BASE', 'normalizeDetail',
    `return async function(email, extra = {}) { ${apiBody} };`)(fetch, '/register', (value, fallback) => value || fallback);
}

async function submit(sendEmailCode) {
  const state = { navigation: [], error: null, busy: false };
  const env = {
    emailOk: true, anyBusy: false, email: ' qa@example.com ', role: 'client',
    setEmailBusy: (value) => { state.busy = value; },
    setEmailError: (value) => { state.error = value; }, t: (key) => key,
    regAPI: { sendEmailCode }, navigation: { navigate: (...args) => state.navigation.push(args) },
  };
  await new Function(...Object.keys(env), `return async function() { ${submitBody} };`)(...Object.values(env))();
  return state;
}

for (const [label, status, payload, malformed] of [
  ['HTTP 400', 400, { detail: 'rejected' }],
  ['HTTP 503 with misleading sent', 503, { sent: true }],
  ['empty success', 200, {}],
  ['malformed success', 200, {}, true],
  ['delivery denied without error', 200, { sent: false }],
  ['contradictory success', 200, { sent: true, error: 'delivery_failed' }],
  ['rate limit', 429, { detail: 'rate_limited' }],
]) {
  test(`${label} does not claim an email was sent or open OTP`, async () => {
    const send = realSend(status, payload, malformed);
    const result = await send('qa@example.com', { consent: true });
    assert.equal(result.sent, false);
    const state = await submit(send);
    assert.deepEqual(state.navigation, []);
    assert.ok(state.error);
    assert.equal(state.busy, false);
  });
}

test('confirmed delivery opens OTP; network failure retains entry screen', async () => {
  const state = await submit(realSend(200, { sent: true, mock: false, error: null }));
  assert.equal(state.navigation[0][0], 'OtpV2');
  assert.equal(state.navigation[0][1].email, 'qa@example.com');
  const failed = await submit(async () => { throw new Error('offline'); });
  assert.deepEqual(failed.navigation, []);
  assert.equal(failed.error, 'phone_v2_send_failed');
  assert.equal(failed.busy, false);
});
