import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const body = source.split('const onContinue = async () => {')[1].split('\n  };\n\n  return (')[0];
const copy = new Function(`return ${source.match(/const COPY = ([\s\S]*?);\n\nconst MESSENGERS/)[1]}`)();

function harness(saved, extra = {}) {
  const state = { errors: {}, serverError: '', busy: false, navigation: [], roles: [], requests: [] };
  const env = {
    busy: false, validate: () => true, name: ' QA User ', phone: '+77000000001', role: 'client',
    formMountedRef: { current: true }, savingRef: { current: false },
    draft: { ready: true, save: async () => {}, clear: async () => {} },
    company: '', country: '', city: '', messengerType: '', sameAsPhone: true, messengerId: '',
    ui: copy.RU, t: (key) => key,
    setErrors: (fn) => { state.errors = fn(state.errors); },
    setServerError: (value) => { state.serverError = value; },
    setBusy: (value) => { state.busy = value; },
    setCompletion: (value) => { state.completion = value; },
    setTimeout: (fn) => fn(),
    setRole: (role) => state.roles.push(role),
    regAPI: {
      getToken: async () => 'mock-token',
      updateProfile: async (payload) => { state.requests.push(payload); return saved; },
      saveDriverDraft: async () => ({ ok: true }),
      completeBasic: async () => ({ ok: true }),
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

test('успешный client не перезаписывает optional fields и входит в Main', async () => {
  const h = harness({ ok: true });
  await h.run();
  assert.equal(Object.hasOwn(h.state.requests[0], 'company_name'), false);
  assert.equal(Object.hasOwn(h.state.requests[0], 'country'), false);
  assert.equal(Object.hasOwn(h.state.requests[0], 'city'), false);
  assert.deepEqual(h.state.roles, ['client']);
  assert.equal(h.state.navigation[0][0], 'reset');
  assert.equal(h.state.busy, false);
});

test('driver завершает basic и входит без обязательной машины', async () => {
  const h = harness({ ok: true }, { role: 'driver' });
  await h.run();
  assert.deepEqual(h.state.roles, ['driver']);
  assert.equal(h.state.navigation[0][0], 'reset');
  assert.equal(h.state.navigation[0][1].routes[0].name, 'Main');
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
const updateBody = registration.split('async updateProfile(payload = {}, { expectedToken = null } = {}) {')[1].split('\n  },\n\n  // Безопасная смена телефона:')[0];

test('updateProfile сохраняет HTTP status и требует успешный HTTP даже при ok в JSON', async () => {
  for (const status of [200, 401, 429]) {
    const responseOk = status === 200;
    const run = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}, { expectedToken = null } = {}) { ${updateBody} };`)(
      'https://qa.invalid/api/v1', () => ({ ok: false, authRequired: true }),
      async () => ({ ok: responseOk, status, json: async () => ({ ok: true, status: 999, detail: 'test' }) }),
    );
    const result = await run.call({ getToken: async () => 'mock-token' }, { name: 'QA', role: 'client' });
    assert.equal(result.ok, responseOk);
    assert.equal(result.status, status);
  }
});

test('updateProfile не считает пустой/повреждённый HTTP 200 сохранённым профилем', async () => {
  for (const payload of [{}, null, { ok: false }]) {
    const run = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}, { expectedToken = null } = {}) { ${updateBody} };`)(
      '/api', () => ({ ok: false }),
      async () => ({ ok: true, status: 200, json: async () => payload }),
    );
    assert.equal((await run.call({ getToken: async () => 'fixture-only' }, { name: 'QA' })).ok, false);
  }
});

test('ошибки сети и сервера при Save различаются и не меняют роль/экран', async () => {
  const failedNetwork = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}, { expectedToken = null } = {}) { ${updateBody} };`)(
    '/api', () => ({ ok: false }), async () => { throw new TypeError('offline'); },
  );
  const result = await failedNetwork.call({ getToken: async () => 'fixture-only' }, { name: 'QA' });
  assert.equal(result.networkError, true);
  const offline = harness(result); await offline.run();
  assert.equal(offline.state.serverError, 'no_connection');
  assert.deepEqual(offline.state.navigation, []);
  const server = harness({ ok: false, status: 503 }); await server.run();
  assert.equal(server.state.serverError, copy.RU.serverUnavailable);
  assert.ok(server.state.serverError);
  assert.deepEqual(server.state.navigation, []);
  assert.deepEqual(server.state.roles, []);
});

test('updateProfile без token не делает сетевой запрос', async () => {
  const run = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}, { expectedToken = null } = {}) { ${updateBody} };`)(
    'https://qa.invalid/api/v1', () => ({ ok: false, authRequired: true }),
    async () => { assert.fail('Неавторизованный PATCH не должен отправляться'); },
  );
  assert.deepEqual(await run.call({ getToken: async () => null }), { ok: false, authRequired: true });
});

for (const role of ['driver', 'client']) {
  test(`${role}: запоздалый Save A не пишет черновик/роль и не навигирует после входа B`, async () => {
    let token = 'A', release;
    const blocked = new Promise((r) => { release = r; });
    const writes = [];
    const h = harness(null, { role, regAPI: {
      getToken: async () => token,
      updateProfile: async () => blocked,
      saveDriverDraft: async (payload) => { writes.push({ token, payload }); return { ok: true }; },
    } });
    const saving = h.run();
    await new Promise((r) => setImmediate(r));
    token = 'B'; release({ ok: true });
    await saving;
    assert.deepEqual(writes, []);
    assert.deepEqual(h.state.roles, []);
    assert.deepEqual(h.state.navigation, []);
  });
}

test('уход с формы во время сохранения не запускает дальнейшие действия', async () => {
  let release;
  const mounted = { current: true }, writes = [];
  const h = harness(null, { role: 'driver', formMountedRef: mounted, regAPI: {
    getToken: async () => 'A',
    updateProfile: () => new Promise((r) => { release = r; }),
    saveDriverDraft: async () => { writes.push('draft'); return { ok: true }; },
  } });
  const saving = h.run();
  await new Promise((r) => setImmediate(r));
  mounted.current = false; release({ ok: true }); await saving;
  assert.deepEqual(writes, []);
  assert.deepEqual(h.state.navigation, []);
});

test('ожидаемый token не позволяет отправить PATCH под новой сессией', async () => {
  const run = new Function('API_BASE', 'authRequiredResult', 'fetch', `return async function(payload = {}, { expectedToken = null } = {}) { ${updateBody} };`)(
    '/api', () => ({ ok: false }), async () => { assert.fail('PATCH под B запрещён'); },
  );
  const result = await run.call({ getToken: async () => 'B' }, { name: 'Имя A' }, { expectedToken: 'A' });
  assert.equal(result.sessionChanged, true);
});

test('ошибка complete-basic сохраняет форму и не открывает Main', async () => {
  const h = harness({ ok: true }, { role: 'driver', regAPI: {
    getToken: async () => 'A', updateProfile: async () => ({ ok: true }),
    saveDriverDraft: async () => ({ ok: true }), completeBasic: async () => ({ ok: false }),
  } });
  await h.run(); assert.deepEqual(h.state.roles, []); assert.deepEqual(h.state.navigation, []);
  assert.ok(h.state.serverError); assert.equal(h.state.busy, false);
});

test('ответ complete-basic прежнего аккаунта не меняет роль следующего', async () => {
  let token = 'A', finish;
  const h = harness({ ok: true }, { role: 'driver', regAPI: {
    getToken: async () => token, updateProfile: async () => ({ ok: true }),
    saveDriverDraft: async () => ({ ok: true }), completeBasic: () => new Promise(resolve => { finish = resolve; }),
  } });
  const pending = h.run(); await new Promise(resolve => setImmediate(resolve));
  token = 'B'; finish({ ok: true }); await pending;
  assert.deepEqual(h.state.roles, []); assert.deepEqual(h.state.navigation, []);
});

test('смена аккаунта во время показа успеха не назначает роль новой сессии', async () => {
  let token = 'mock-token';
  const h = harness({ ok: true }, {
    setTimeout: (fn) => { token = 'new-account-token'; fn(); },
    regAPI: { getToken: async () => token, updateProfile: async () => ({ ok: true }) },
  });
  await h.run();
  assert.deepEqual(h.state.roles, []);
  assert.deepEqual(h.state.navigation, []);
});
test('отказ локального назначения роли даёт повтор без потери сохранённого профиля', async () => {
  const h = harness({ ok: true }, { setRole: async () => ({ ok: false }) });
  await h.run();
  assert.equal(h.state.completion, 'error');
  assert.deepEqual(h.state.navigation, []);
  assert.equal(h.state.busy, false);
});


test('ошибка локального завершения сохраняет поколение черновика для штатного retry', async () => {
  let cleared = 0, attempts = 0;
  const draft = { ready: true, save: async () => { if (cleared) throw new Error('stale_generation'); }, clear: async () => { cleared++; } };
  const h = harness({ ok: true }, { draft, setRole: () => ({ ok: ++attempts > 1 }) });
  await h.run();
  assert.equal(h.state.completion, 'error');
  assert.equal(cleared, 0);
  await h.run();
  assert.equal(attempts, 2);
  assert.equal(cleared, 1);
  assert.equal(h.state.navigation[0][0], 'reset');
});

test('успешный role commit очищает свой черновик после размонтирования формы', async () => {
  const mounted = { current: true };
  let cleared = 0;
  const h = harness({ ok: true }, {
    formMountedRef: mounted,
    draft: { ready: true, save: async () => {}, clear: async () => { cleared++; } },
    setRole: () => { mounted.current = false; return { ok: true }; },
  });
  await h.run();
  assert.equal(cleared, 1);
  assert.deepEqual(h.state.navigation, []);
});

test('поздний role commit не очищает черновик после смены bearer', async () => {
  let token = 'mock-token', cleared = 0;
  const h = harness({ ok: true }, {
    draft: { ready: true, save: async () => {}, clear: async () => { cleared++; } },
    setRole: () => { token = 'other-token'; return { ok: true }; },
    regAPI: { getToken: async () => token, updateProfile: async () => ({ ok: true }) },
  });
  await h.run();
  assert.equal(cleared, 0);
  assert.deepEqual(h.state.navigation, []);
});
