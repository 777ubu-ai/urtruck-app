import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../../src/utils/languages.js';

const source = readFileSync('src/screens/MyTripsScreen.js','utf8');
const start = source.indexOf('  const performPublicationAction = async');
const end = source.indexOf('\n  const renderHistoryItem',start);
assert.ok(start >= 0 && end > start);
const actionCode = source.slice(start,end);
const copyStart = source.indexOf('const EXPIRY_COPY = ');
const copyEnd = source.indexOf('\n};', copyStart);
assert.ok(copyStart >= 0 && copyEnd > copyStart);
const expiryCopy = Function(source.slice(copyStart, copyEnd + 3) + '\nreturn EXPIRY_COPY;')();
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ driver = false, language = 'RU' } = {}) {
  const pending = [], toasts = [], states = [];
  const env = {
    publicationOwner: { current: 'owner-A' }, publicationLocks: { current: new Set() },
    confirmAction: async () => true, EXPIRY_COPY: expiryCopy,
    lang: language, t: value => value, isDriver: driver,
    setPublicationBusy: value => states.push(value),
    marketAPI: { ownedPublicationAction: (...args) => new Promise(resolve => pending.push({args,resolve})) },
    toast: (value,kind) => toasts.push({value,kind}), load: () => states.push('reload'),
  };
  const run = new Function(...Object.keys(env), actionCode + '\nreturn performPublicationAction;')(...Object.values(env));
  return { env,run,pending,toasts,states };
}
for (const driver of [false,true]) test(`${driver ? 'рейс' : 'груз'}: повторные нажатия не создают повторных запросов`, async () => {
  const h=harness({driver}); const item={id:'fixture',publication_period_id:'period-1'};
  const first=h.run(item,'renew'); await tick(); await h.run(item,'renew');
  assert.equal(h.pending.length,1);
  assert.deepEqual(h.pending[0].args,[driver ? 'trip' : 'cargo','fixture','renew','period-1']);
  h.pending[0].resolve({ok:true}); await first;
  assert.equal(h.toasts[0].kind,'success'); assert.ok(h.states.includes('reload'));
});
test('сетевая ошибка не сообщает об успешном продлении', async () => {
  const h=harness(); const req=h.run({id:'fixture',publication_period_id:'period-1'},'renew'); await tick();
  h.pending[0].resolve({ok:false}); await req;
  assert.equal(h.toasts[0].kind,'error'); assert.ok(!h.states.includes('reload'));
});
test('ответ прошлого владельца не показывает успех новому аккаунту', async () => {
  const h=harness(); const req=h.run({id:'fixture',publication_period_id:'period-1'},'renew'); await tick();
  h.env.publicationOwner.current='owner-B'; h.pending[0].resolve({ok:true}); await req;
  assert.equal(h.toasts.length,0); assert.ok(!h.states.includes('reload'));
});
for (const { code } of LANGUAGES) for (const driver of [false, true]) {
  test(`${code} / ${driver ? 'рейс' : 'груз'}: ошибка и повтор действий используют выбранный язык`, async () => {
    const h = harness({ driver, language: code });
    const item = { id: 'fixture', publication_period_id: 'period-1' };
    for (const [action, ok] of [['renew', false], ['renew', true], ['archive', true], ['hide', true]]) {
      const request = h.run(item, action); await tick();
      h.pending.at(-1).resolve({ ok }); await request;
      assert.deepEqual(h.toasts.at(-1), {
        value: expiryCopy[code][ok ? 'success' : 'error'], kind: ok ? 'success' : 'error',
      });
      assert.equal(h.pending.at(-1).args[2], action);
    }
  });
}
