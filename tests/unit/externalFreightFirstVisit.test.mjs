import test from 'node:test';
import assert from 'node:assert/strict';
import { openFirstExternalFeed, externalFeedFirstVisitKey } from '../../src/utils/externalFreightFirstVisit.js';

function harness(overrides = {}) {
  const data = new Map(), calls = [];
  const args = {
    storage: { get: async key => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); } },
    navigation: { navigate: route => calls.push(route) },
    userId: 'account-A', role: 'driver', enabled: true, verified: true,
    ...overrides,
  };
  return { args, data, calls };
}
for (const role of ['driver', 'client']) {
  test(`${role}: первый вход открывает ленту один раз, включая новый экземпляр`, async () => {
    const { args, data, calls } = harness({ role });
    assert.equal(await openFirstExternalFeed(args), true);
    assert.equal(data.get(externalFeedFirstVisitKey(args.userId)), '1');
    assert.equal(await openFirstExternalFeed({ ...args }), false);
    assert.deepEqual(calls, ['ExternalFreightFeed']);
  });
}
for (const overrides of [{ enabled: false }, { verified: false }, { role: 'guest' }, { role: null }, { userId: null }]) {
  test(`неподходящий вход не меняет навигацию: ${JSON.stringify(overrides)}`, async () => {
    const { args, data, calls } = harness(overrides);
    assert.equal(await openFirstExternalFeed(args), false);
    assert.equal(data.size, 0); assert.deepEqual(calls, []);
  });
}
test('разные аккаунты получают независимый первый показ', async () => {
  const { args, calls } = harness();
  assert.equal(await openFirstExternalFeed(args), true);
  assert.equal(await openFirstExternalFeed({ ...args, userId: 'account-B' }), true);
  assert.equal(await openFirstExternalFeed(args), false);
  assert.equal(calls.length, 2);
});
test('переход по ссылке или смена владельца во время чтения не перехватывается', async () => {
  let current = true;
  const { args, calls, data } = harness({ isCurrent: () => current });
  args.storage.get = async () => { current = false; return null; };
  assert.equal(await openFirstExternalFeed(args), false);
  assert.equal(data.size, 0); assert.deepEqual(calls, []);
});
test('потеря focus во время сохранения не вызывает переход', async () => {
  let current = true;
  const { args, calls } = harness({ isCurrent: () => current });
  args.storage.set = async () => { current = false; };
  assert.equal(await openFirstExternalFeed(args), false);
  assert.deepEqual(calls, []);
});
for (const mode of ['read-failure', 'write-failure', 'silent-write-failure']) {
  test(`ошибка storage оставляет основной экран: ${mode}`, async () => {
    const { args, calls } = harness();
    if (mode === 'read-failure') args.storage.get = async () => { throw new Error('unavailable'); };
    if (mode === 'write-failure') args.storage.set = async () => { throw new Error('unavailable'); };
    if (mode === 'silent-write-failure') args.storage.set = async () => {};
    assert.equal(await openFirstExternalFeed(args), false);
    assert.deepEqual(calls, []);
  });
}
