import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const body = source.split('const onContinue = async () => {')[1].split('\n  };\n\n  const showMessengerContact')[0];
const copy = new Function(`return ${source.match(/const COPY = ([\s\S]*?);\n\nconst MESSENGERS/)[1]}`)();

function harness(saved, extra = {}) {
  const state = { errors: {}, serverError: '', busy: false, navigation: [], roles: [], requests: [] };
  const env = {
    busy: false, validate: () => true, name: ' QA User ', phone: '+77000000001', role: 'client',
    company: '', country: '', city: '', messengerType: '', sameAsPhone: true, messengerId: '',
    ui: copy.RU, t: (key) => key,
    setErrors: (fn) => { state.errors = fn(state.errors); },
    setServerError: (value) => { state.serverError = value; },
    setBusy: (value) => { state.busy = value; },
    setRole: (role) => state.roles.push(role),
    regAPI: {
      updateProfile: async (payload) => { state.requests.push(payload); return saved; },
      saveDriverDraft: async () => ({ ok: true }),
    },
    navigation: {
      replace: (...args) => state.navigation.push(['replace', ...args]),
      reset: (...args) => state.navigation.push(['reset', ...args]),
    },
    ...extra,
  };
  const run = new Function(...Object.keys(env), `return async function() { ${body} };`)(...Object.values(env));
  return { state, run };
}

for (const [code, field, expected] of [
  ['PHONE_REQUIRED', 'phone', 'prem_reg_phone_invalid'],
  ['INVALID_PHONE', 'phone', 'prem_reg_phone_invalid'],
  ['NAME_REQUIRED', 'name', 'profile_v2_err_name'],
  ['PHONE_CHANGE_OTP_REQUIRED', 'phone', copy.RU.phoneChangeRequired],
  ['PHONE_ALREADY_IN_USE', 'phone', copy.RU.phoneAlreadyInUse],
  ['MESSENGER_CONTACT_REQUIRED', 'messenger', copy.RU.messengerRequired],
]) {
  test(`серверная ошибка ${code} показывается у поля без входа и смены роли`, async () => {
    assert.ok(expected, 'Локализованная причина должна существовать');
    const h = harness({ ok: false, detail: { error: code, message: 'raw backend' } });
    await h.run();
    assert.equal(h.state.errors[field], expected);
    assert.equal(h.state.serverError, '');
    assert.equal(h.state.busy, false);
    assert.deepEqual(h.state.roles, []);
    assert.deepEqual(h.state.navigation, []);
  });
}

test('конфликт роли не маскируется общей ошибкой сохранения', async () => {
  const h = harness({ ok: false, detail: { error: 'ROLE_ALREADY_SET' } });
  await h.run();
  assert.ok(copy.RU.roleAlreadySet);
  assert.equal(h.state.serverError, copy.RU.roleAlreadySet);
  assert.equal(h.state.busy, false);
  assert.deepEqual(h.state.roles, []);
});

test('401 и отсутствующий token объясняются как истёкшая сессия', async () => {
  for (const result of [{ ok: false, status: 401 }, { ok: false, authRequired: true, error: 'AUTH_REQUIRED' }]) {
    const h = harness(result);
    await h.run();
    assert.equal(h.state.serverError, 'session_expired');
    assert.equal(h.state.busy, false);
    assert.deepEqual(h.state.navigation, []);
  }
});

test('429 имеет отдельное объяснение, а неизвестная ошибка не раскрывает raw detail', async () => {
  const limited = harness({ ok: false, status: 429 });
  await limited.run();
  assert.ok(copy.RU.retryLater);
  assert.equal(limited.state.serverError, copy.RU.retryLater);
  const unknown = harness({ ok: false, detail: 'internal private detail' });
  await unknown.run();
  assert.equal(unknown.state.serverError, 'profile_v2_save_failed');
  assert.equal(unknown.state.busy, false);
});

test('успешный client сохраняет пустые optional fields и входит в Main', async () => {
  const h = harness({ ok: true });
  await h.run();
  assert.equal(h.state.requests[0].company_name, '');
  assert.equal(h.state.requests[0].country, '');
  assert.equal(h.state.requests[0].city, '');
  assert.deepEqual(h.state.roles, ['client']);
  assert.equal(h.state.navigation[0][0], 'reset');
  assert.equal(h.state.busy, false);
});

test('driver переходит к машине после сохранения draft, без преждевременной роли', async () => {
  const h = harness({ ok: true }, { role: 'driver' });
  await h.run();
  assert.deepEqual(h.state.roles, []);
  assert.equal(h.state.navigation[0][0], 'replace');
  assert.equal(h.state.navigation[0][1], 'VehicleSetupCountry');
});

test('busy и невалидная форма не отправляют PATCH', async () => {
  for (const extra of [{ busy: true }, { validate: () => false }]) {
    const h = harness({ ok: true }, extra);
    await h.run();
    assert.deepEqual(h.state.requests, []);
  }
});

test('новые причины ошибок определены для всех четырёх языков', () => {
  for (const lang of ['RU', 'EN', 'ZH', 'KK']) {
    for (const key of ['phoneChangeRequired', 'phoneAlreadyInUse', 'roleAlreadySet', 'retryLater']) {
      assert.equal(typeof copy[lang][key], 'string');
      assert.ok(copy[lang][key].trim());
    }
  }
});

const registration = readFileSync('src/utils/registration.js', 'utf8');
const updateBody = registration.split('async updateProfile(payload = {}) {')[1].split('\n  },\n\n  // Безопасная смена телефона:')[0];

test('updateProfile сохраняет настоящий HTTP status и не принимает подменённый ok из JSON', async () => {
  for (const status of [200, 401, 429]) {
    const responseOk = status === 200;
    const run = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}) { ${updateBody} };`)(
      'https://qa.invalid/api/v1', () => ({ ok: false, authRequired: true }),
      async () => ({ ok: responseOk, status, json: async () => ({ ok: !responseOk, status: 999, detail: 'test' }) }),
    );
    const result = await run.call({ getToken: async () => 'mock-token' }, { name: 'QA', role: 'client' });
    assert.equal(result.ok, responseOk);
    assert.equal(result.status, status);
  }
});

test('updateProfile без token не делает сетевой запрос', async () => {
  const run = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}) { ${updateBody} };`)(
    'https://qa.invalid/api/v1', () => ({ ok: false, authRequired: true }),
    async () => { assert.fail('Неавторизованный PATCH не должен отправляться'); },
  );
  assert.deepEqual(await run.call({ getToken: async () => null }), { ok: false, authRequired: true });
});
