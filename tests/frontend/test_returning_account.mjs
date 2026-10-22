import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveLoginRole, resolveLoginAccount, loginIsCurrent } from '../../src/utils/loginAccount.js';
import { runAuthMutation, commitVerifiedLogin } from '../../src/utils/authMutation.js';

test('сохранённая роль из подтверждённого входа не зависит от дополнительного запроса', async () => {
  for (const role of ['driver', 'client']) {
    assert.equal(await resolveLoginRole({ role, user_id: 'existing' }, () => { throw new Error('offline'); }), role);
  }
});

test('старый backend: роль берётся из текущего аккаунта с тем же ID', async () => {
  assert.equal(await resolveLoginRole({ user_id: 'old' }, async () => ({ id: 'old', role: 'driver', verification_level: 1 })), 'driver');
  assert.equal(await resolveLoginRole({}, async () => ({ id: 'new', role: 'guest', verification_level: 1 })), null);
});

test('сбой, пустой ответ или чужой ID не превращаются в новую регистрацию', async () => {
  for (const me of [null, {}, { id: 'old', role: 'guest' }, { id: 'other', role: 'driver', verification_level: 1 }, { id: 'old', verification_level: 1 }]) {
    await assert.rejects(resolveLoginRole({ user_id: 'old' }, async () => me), /LOGIN_ACCOUNT_UNAVAILABLE/);
  }
  await assert.rejects(resolveLoginRole({}, async () => { throw new Error('offline'); }), /offline/);
});

const otp = readFileSync('src/screens/onboarding/OtpV2Screen.js', 'utf8');
const body = otp.split('const verify = async (codeArg) => {')[1].split('\n  };\n\n  const onResend')[0];

function otpHarness(api) {
  const state = { error: '', code: '8342', navigation: [], signedIn: [], roles: [], verifyCalls: 0, token: 'test-proof' };
  const env = {
    CODE_LEN: 4,
    code: state.code, isEmail: true, identifier: 'existing@example.com', emailAddr: 'existing@example.com', channel: 'email',
    verifyingRef: { current: false }, pendingLoginRef: { current: null },
    authMountedRef: { current: true },
    setLoading: () => {}, setError: (x) => { state.error = x; }, setCode: (x) => { state.code = x; }, setSecondsLeft: () => {},
    t: (x) => x, resolveLoginAccount, loginIsCurrent,
    regAPI: {
      verifyEmailCode: async () => { state.verifyCalls++; return { token: 'test-proof', user_id: 'old', verification_level: 1 }; },
      me: () => api.me(),
      getToken: async () => state.token,
    },
    push: { autoRegister: async () => {} },
    signIn: async (...args) => state.signedIn.push(args),
    setRole: async (x) => state.roles.push(x), refreshLevel: async () => {},
    navigation: { reset: (x) => state.navigation.push(x) },
  };
  const verify = new Function(...Object.keys(env), `return async function(codeArg) { ${body} };`)(...Object.values(env));
  return { state, verify, mounted: env.authMountedRef };
}

test('OTP: retry загрузки профиля не проверяет использованный код снова и не открывает регистрацию', async () => {
  let fail = true;
  const h = otpHarness({ me: async () => { if (fail) throw new Error('offline'); return { id: 'old', role: 'driver', verification_level: 1 }; } });
  await h.verify();
  assert.equal(h.state.error, 'auth_account_load_failed');
  assert.equal(h.state.code, '8342');
  assert.deepEqual(h.state.navigation, []);
  assert.deepEqual(h.state.signedIn, []);
  fail = false;
  await h.verify();
  assert.equal(h.state.verifyCalls, 1);
  assert.equal(h.state.navigation[0].routes[0].name, 'Main');
  assert.deepEqual(h.state.roles, ['driver']);
});

test('OTP: только подтверждённый guest попадает на выбор роли', async () => {
  const h = otpHarness({ me: async () => ({ id: 'old', role: 'guest', verification_level: 1 }) });
  await h.verify();
  assert.equal(h.state.navigation[0].routes[0].name, 'RoleV2');
});

test('OTP: двойное подтверждение не создаёт две попытки входа', async () => {
  let release;
  const pending = new Promise((r) => { release = r; });
  const h = otpHarness({ me: async () => pending });
  const first = h.verify();
  await h.verify();
  release({ id: 'old', role: 'driver', verification_level: 1 });
  await first;
  assert.equal(h.state.verifyCalls, 1);
  assert.equal(h.state.navigation.length, 1);
});

const registration = readFileSync('src/utils/registration.js', 'utf8');
const meBody = registration.split('async me() {')[1].split('\n  },\n\n  // Raw status')[0];

test('HTTP 5xx с JSON не используется как данные нового аккаунта', async () => {
  for (const status of [429, 500, 503]) {
    const me = new Function('BASE', 'fetch', 'storage', 'LEVEL_KEY', `return async function() { ${meBody} };`)(
      '/api/register', async () => ({ ok: false, status, json: async () => ({ id: 'new', role: 'guest', verification_level: 1 }) }),
      { set: async () => {} }, 'level',
    );
    await assert.rejects(me.call({ getToken: async () => 'test-proof' }), /ACCOUNT_FETCH_FAILED/);
  }
});

test('запоздалый OTP A не возвращает прежний аккаунт после входа B или ухода со страницы', async () => {
  for (const unmount of [true, false]) {
    let release;
    const blocked = new Promise((r) => { release = r; });
    const h = otpHarness({ me: () => blocked });
    const running = h.verify();
    await new Promise((r) => setImmediate(r));
    h.state.token = 'token-B';
    if (unmount) h.mounted.current = false;
    release({ id: 'old', role: 'driver', verification_level: 1 });
    await running;
    assert.equal(h.state.token, 'token-B');
    assert.deepEqual(h.state.signedIn, []);
    assert.deepEqual(h.state.roles, []);
    assert.deepEqual(h.state.navigation, []);
  }
});

test('подтверждение A в общей очереди не перезаписывает токен B', async () => {
  let token = 'guest';
  await runAuthMutation(async () => { token = 'B'; });
  const committed = await commitVerifiedLogin({
    expectedToken: 'guest', readToken: async () => token,
    write: async () => { token = 'A'; },
  });
  assert.equal(committed, false);
  assert.equal(token, 'B');
});

test('размонтированный экран не сохраняет токен даже без нового владельца', async () => {
  let token = 'guest';
  const committed = await commitVerifiedLogin({
    expectedToken: 'guest', readToken: async () => token, isCurrent: () => false,
    write: async () => { token = 'A'; },
  });
  assert.equal(committed, false);
  assert.equal(token, 'guest');
});

const authSource = readFileSync('src/utils/AuthContext.js', 'utf8');
const loginContext = authSource.slice(authSource.indexOf('const signIn ='), authSource.indexOf('const signOut ='));
function contextHarness() {
  const state = { token: 'B', session: { user: { id: 'A', role: 'client', name: 'Имя A' } } };
  const env = {
    runAuthMutation, authGenerationRef: { current: 0 }, sessionRef: { current: state.session },
    regAPI: { getToken: async () => state.token },
    storage: { set: async (key, value) => { if (key === 'ur_reg_token') state.token = value; } },
    KEY: 'session', setSession: (x) => { state.session = x; },
    setVerificationLevel: () => {}, setHasToken: () => {}, refreshLevel: async () => {},
  };
  return { state, api: new Function(...Object.keys(env), `${loginContext}\nreturn { signIn, setRole };`)(...Object.values(env)) };
}

test('подтверждённый ID B заменяет ID/имя/роль A до фоновой загрузки профиля', async () => {
  const h = contextHarness();
  await h.api.signIn('B@example.com', 1, 'B', { expectedToken: 'B', userId: 'B' });
  assert.deepEqual(h.state.session.user, { phone: 'B@example.com', role: null, id: 'B' });
  await h.api.setRole('driver', { expectedToken: 'B' });
  assert.equal(h.state.session.user.id, 'B');
  assert.equal(h.state.session.user.role, 'driver');
});

test('проверка владельца внутри очереди signIn/setRole не допускает старый callback A', async () => {
  const h = contextHarness();
  const before = structuredClone(h.state.session);
  assert.equal(await h.api.signIn('A@example.com', 1, 'A', { expectedToken: 'A', userId: 'A' }), false);
  assert.equal((await h.api.setRole('driver', { expectedToken: 'A' })).ok, false);
  assert.equal(h.state.token, 'B');
  assert.deepEqual(h.state.session, before);
});
