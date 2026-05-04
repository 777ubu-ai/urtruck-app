// Currency regression — cargo created with currency=KZT must keep KZT
// in BOTH the detail endpoint and the public list. Earlier the list
// query forgot to SELECT the currency column, so list rows always
// reported currency=undefined while detail correctly returned KZT.
//
// Independent from Serik/Boris fixtures: provisions its own throw-away
// QA actor so it can be run in isolation (`npx playwright test
// --config qa/playwright.config.js qa/agents/cargo.currency.spec.js`).

const { test } = require('@playwright/test');
const qaApi = require('../utils/qaApi');
const { QA_TAG } = require('../utils/qaConfig');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-currency';

test.describe.configure({ mode: 'serial' });

test('Cargo currency · KZT round-trip', async () => {
  const session = await qaApi.ensureActor('boris', { role: 'client' });
  if (!session.token) {
    log.p0(ACTOR, 'ensure-actor', `${session.source}: ${session.error || ''}`.trim());
    return;
  }
  const headers = { actor: ACTOR, token: session.token };

  const created = await qaApi.post('/market/cargos', {
    from_city: 'Алматы',
    to_city: 'Москва',
    cargo_desc: `currency-regression ${QA_TAG}`,
    cargo_type: 'tent',
    weight_tons: 5,
    volume_m3: 20,
    price: 5000,
    currency: 'KZT',
    pickup_date: '2026-06-01',
    photos: [],
  }, headers);

  if (!created.ok || !created.json?.id) {
    log.p0(ACTOR, 'create-cargo-kzt', `${created.status} ${(created.text || '').slice(0, 200)}`);
    return;
  }
  const id = created.json.id;
  log.pass(ACTOR, 'create-cargo-kzt', `id=${id}`);

  // Detail endpoint must return KZT
  const detail = await qaApi.get(`/market/cargos/${id}`);
  if (detail.json?.currency === 'KZT') {
    log.pass(ACTOR, 'detail-currency-kzt');
  } else {
    log.p0(ACTOR, 'detail-currency-kzt', `expected KZT, got ${JSON.stringify(detail.json?.currency)}`);
  }

  // List endpoint must include the cargo with currency=KZT
  const list = await qaApi.get('/market/cargos', {
    ...headers,
    query: { status: 'active', limit: 200 },
  });
  const found = (list.json?.cargos || []).find((c) => c.id === id);
  if (!found) {
    log.p1(ACTOR, 'list-cargo-visible', 'created cargo missing from public list');
  } else if (found.currency === 'KZT') {
    log.pass(ACTOR, 'list-currency-kzt');
  } else {
    log.p0(ACTOR, 'list-currency-kzt', `expected KZT, got ${JSON.stringify(found.currency)}`);
  }
});
