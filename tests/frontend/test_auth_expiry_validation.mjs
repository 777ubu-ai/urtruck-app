import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/utils/authEvents.js', 'utf8');
let counter = 0;
async function setup(getToken, validateToken) {
  const mod = await import('data:text/javascript,' + encodeURIComponent(source + '\n// test ' + ++counter));
  const events = [];
  mod.configureAuthExpiryValidation({ getToken, validateToken });
  mod.subscribeAuthExpired(token => events.push(token));
  return { mod, events };
}
const init = { headers: { Authorization: 'Bearer current' } };
const unauthorized = async () => ({ status: 401 });

test('guest 401 never validates or expires current login', async () => {
  let calls = 0;
  const { mod, events } = await setup(async () => 'current', async () => { calls++; return 401; });
  await mod.authedFetch('/market', {}, unauthorized);
  assert.equal(calls, 0); assert.deepEqual(events, []);
});
test('delayed old bearer 401 cannot log out newer login', async () => {
  let calls = 0;
  const { mod, events } = await setup(async () => 'newer', async () => { calls++; return 401; });
  await mod.authedFetch('/market', init, unauthorized);
  assert.equal(calls, 0); assert.deepEqual(events, []);
});
test('feature 401 with valid authoritative session preserves login', async () => {
  const { mod, events } = await setup(async () => 'current', async () => 200);
  const response = await mod.authedFetch('/chat', init, unauthorized);
  assert.equal(response.status, 401); assert.deepEqual(events, []);
});
test('network error or 5xx during validation preserves login', async () => {
  for (const fail of [async () => { throw new Error('offline'); }, async () => 503]) {
    const { mod, events } = await setup(async () => 'current', fail);
    await mod.authedFetch('/market', init, unauthorized);
    assert.deepEqual(events, []);
  }
});
test('confirmed rejection of current session still triggers scoped expiry', async () => {
  const { mod, events } = await setup(async () => 'current', async () => 401);
  await mod.authedFetch('/market', init, unauthorized);
  assert.deepEqual(events, ['current']);
});
test('login change while authoritative check is pending suppresses expiry', async () => {
  let token = 'current';
  const { mod, events } = await setup(async () => token, async () => { token = 'newer'; return 401; });
  await mod.authedFetch('/market', init, unauthorized);
  assert.deepEqual(events, []);
});
test('parallel rejected requests share one authoritative session check', async () => {
  let calls = 0, release;
  const blocked = new Promise(resolve => { release = resolve; });
  const { mod, events } = await setup(async () => 'current', async () => { calls++; return blocked; });
  const jobs = [mod.authedFetch('/chat', init, unauthorized), mod.authedFetch('/market', init, unauthorized)];
  await new Promise(resolve => setImmediate(resolve)); release(401);
  await Promise.all(jobs); assert.equal(calls, 1); assert.deepEqual(events, ['current']);
});
test('logout suppression and caller AbortSignal remain intact', async () => {
  const { mod, events } = await setup(async () => 'current', async () => 401);
  mod.setAuthExpirySuppressed(true);
  const signal = new AbortController().signal;
  await mod.authedFetch('/chat', { ...init, signal }, async (_, options) => {
    assert.equal(options.signal, signal); return { status: 401 };
  });
  assert.deepEqual(events, []);
});
test('timeout bounds an unresponsive validation transport without logging out', async () => {
  const { mod, events } = await setup(async () => 'current', async () => new Promise(() => {}));
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => original(fn, ms === 5000 ? 1 : ms, ...args);
  try { await mod.authedFetch('/market', init, unauthorized); }
  finally { globalThis.setTimeout = original; }
  assert.deepEqual(events, []);
});
