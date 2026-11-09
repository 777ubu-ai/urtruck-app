import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCountryCode } from '../../src/utils/routeCountryCode.js';
import { marketAPI } from '../../src/utils/marketAPI.js';
import { storage } from '../../src/utils/storage.js';
import { routeCountryCopy } from '../../src/utils/routeCountryCopy.js';
import { publicationDraftKey, loadPublicationDraft, savePublicationDraft, readPublicationDraft, clearPublicationDraft } from '../../src/utils/publicationDraft.js';

const values = { from_country: 'KZ', to_country: 'IR', request_id: 'route-explicit-country' };

test('уточнение передаёт действующую сессию и сохраняет тот же request_id при retry503', async () => {
  const old = globalThis.fetch; const calls = [];
  await storage.set('ur_reg_token', 'synthetic-route-owner');
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(calls.length === 1 ? { detail: 'temporary' } : { ok: true }), { status: calls.length === 1 ? 503 : 200 });
  };
  try {
    assert.equal((await marketAPI.clarifyRouteCountry('cargo', 'same-id', values)).ok, false);
    assert.equal((await marketAPI.clarifyRouteCountry('cargo', 'same-id', values)).ok, true);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.url, /\/cargos\/same-id\/route-country$/);
      assert.equal(call.init.headers.Authorization, 'Bearer synthetic-route-owner');
      assert.deepEqual(JSON.parse(call.init.body), values);
    }
  } finally { globalThis.fetch = old; }
});

test('после смены bearer во время чтения headers уточнение не отправляется от другого владельца', async () => {
  const get = storage.get, fetch = globalThis.fetch;
  let finish; let calls = 0;
  storage.get = async () => new Promise(resolve => { finish = resolve; });
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  try {
    const pending = marketAPI.clarifyRouteCountry('cargo', 'same-id', values, { expectedToken: 'token-A', isCurrent: () => true });
    finish('token-B');
    const result = await pending;
    assert.equal(result.ok, false); assert.equal(calls, 0);
    assert.equal(result.code, 'PUBLICATION_SESSION_CHANGED');
  } finally { storage.get = get; globalThis.fetch = fetch; }
});

test('поздний ответ другого экрана не выдаётся за успешное уточнение текущего аккаунта', async () => {
  const fetch = globalThis.fetch; let finish; let current = true;
  await storage.set('ur_reg_token', 'synthetic-route-owner');
  globalThis.fetch = async () => new Promise(resolve => { finish = resolve; });
  try {
    const pending = marketAPI.clarifyRouteCountry('deal', 'old-deal', values, { isCurrent: () => current });
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    current = false; finish(new Response('{"ok":true}'));
    assert.equal((await pending).stale, true);
  } finally { globalThis.fetch = fetch; }
});

test('подтверждение относится к показанному proposal ID, без клиентского обхода второй стороны', async () => {
  const fetch = globalThis.fetch; let call;
  await storage.set('ur_reg_token', 'synthetic-counterparty');
  globalThis.fetch = async (url, init) => { call = { url: String(url), init }; return new Response('{"ok":true}'); };
  try {
    await marketAPI.confirmDealRouteCountry('deal-1', 'proposal-old');
    assert.match(call.url, /\/deals\/deal-1\/route-country\/proposal-old\/confirm$/);
    assert.equal(call.init.body, undefined);
    assert.equal(call.init.headers.Authorization, 'Bearer synthetic-counterparty');
  } finally { globalThis.fetch = fetch; }
});

test('зависший запрос ограничен таймаутом и не удаляет действующий bearer', async () => {
  const fetch = globalThis.fetch, timer = globalThis.setTimeout;
  await storage.set('ur_reg_token', 'synthetic-kept-token');
  globalThis.setTimeout = (fn, ms, ...args) => timer(fn, ms === 15000 ? 1 : ms, ...args);
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  });
  try {
    const result = await marketAPI.clarifyRouteCountry('cargo', 'same-id', values);
    assert.equal(result.ok, false);
    assert.equal(await storage.get('ur_reg_token'), 'synthetic-kept-token');
  } finally { globalThis.fetch = fetch; globalThis.setTimeout = timer; }
});

test('черновик страны разделён по владельцу и API; успешная очистка не даёт старому сохранению воскресить его', async () => {
  const a = publicationDraftKey('route-country:cargo:same-id', 'A');
  const b = publicationDraftKey('route-country:cargo:same-id', 'B');
  assert.notEqual(a, b); assert.match(a, /https%3A|%2Fapi/);
  const { generation } = await loadPublicationDraft(a);
  await savePublicationDraft(a, values, generation);
  assert.equal((await readPublicationDraft(a)).request_id, values.request_id);
  assert.equal(await readPublicationDraft(b), null);
  assert.equal(await clearPublicationDraft(a, values, null, generation), true);
  await assert.rejects(savePublicationDraft(a, values, generation), /PUBLICATION_DRAFT_FAILED/);
  assert.equal(await readPublicationDraft(a), null);
});

test('подписи нового пути присутствуют на всех девяти языках без пустых ключей', () => {
  const keys = Object.keys(routeCountryCopy('RU')).sort();
  for (const lang of ['RU', 'EN', 'ZH', 'KK', 'TR', 'UZ', 'KY', 'TG', 'BE']) {
    assert.deepEqual(Object.keys(routeCountryCopy(lang)).sort(), keys);
    assert.ok(Object.values(routeCountryCopy(lang)).every(x => typeof x === 'string' && x.trim().length > 0));
  }
});


test('известные legacy-страны нормализуются без выбора неизвестной стороны', () => {
  for (const value of ['Казахстан', 'Kazakhstan', ' KAZ ', 'kz']) assert.equal(routeCountryCode(value), 'KZ');
  assert.equal(routeCountryCode('Russian Federation'), 'RU');
  assert.equal(routeCountryCode('AX'), 'AX');
  for (const value of ['XX', 'ZZ', 'Neverland', '', null]) assert.equal(routeCountryCode(value), '');
});
