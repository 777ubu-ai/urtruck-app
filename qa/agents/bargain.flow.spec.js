// Bargain flow — сквозной тест ЛОГИКИ торга без UI (пункт «самая главная фишка»).
//
// Проходит всю цепочку через API и проверяет стыки, которые Maestro не видит
// (он только кликает по экрану, а в базу/ответы сервера не смотрит):
//   1. boris (клиент) публикует груз.
//   2. serik (водитель) ставит ставку.
//   3. boris делает контр-предложение.
//   4. serik принимает контр → создаётся сделка.
//   5. История цены (/bids/{id}/events) содержит корректную цепочку
//      proposed → countered → accepted.
//   6. БЕЗОПАСНОСТЬ: историю цены НЕ может прочитать посторонний (auditor → 403).
//   7. ПРИВАТНОСТЬ: телефон оферента НЕ утекает не-владельцу листинга.
//
// Не нужен симулятор/Expo Go — значит не зависит от занятости симулятора.
// Запуск: npm run qa:bargain (бэкенд должен быть поднят; BASE берётся из qaConfig).

const { test, expect } = require('@playwright/test');
const { ACTORS } = require('../utils/qaConfig');
const qaApi = require('../utils/qaApi');
const qaData = require('../utils/qaData');
const { log, attach } = require('../utils/qaReport');

const B = 'boris';
const S = 'serik';
const A = 'auditor';

test.describe.configure({ mode: 'serial' });

test('Bargain · сквозной торг + история цены + приватность', async () => {
  // 0. Сессии всех троих через стабильный /qa/ensure-actor.
  const bs = await qaApi.ensureActor(B, { role: 'client' });
  const ss = await qaApi.ensureActor(S, { role: 'driver' });
  const as = await qaApi.ensureActor(A, { role: 'auditor' });
  if (!bs.token || !ss.token) {
    log.p0('bargain', 'ensure-actor', `boris=${!!bs.token} serik=${!!ss.token} ${bs.error || ss.error || ''}`);
    return;
  }
  const boris = { actor: ACTORS.boris.handle, token: bs.token };
  const serik = { actor: ACTORS.serik.handle, token: ss.token };
  const auditor = as.token ? { actor: ACTORS.auditor.handle, token: as.token } : null;

  // 1. boris публикует груз.
  const created = await qaApi.post('/market/cargos', qaData.borisCargoPayload(), boris);
  const cargoId = created.json && created.json.id;
  expect(created.ok, `publish cargo: ${created.status} ${created.text || ''}`.slice(0, 200)).toBeTruthy();
  expect(cargoId, 'cargo id present').toBeTruthy();
  log.pass('bargain', 'publish-cargo', `id=${cargoId}`);

  // 2. serik ставит ставку.
  const bid = await qaApi.post('/market/bids', qaData.serikBidPayload(cargoId, { amount: 4800 }), serik);
  const bidId = bid.json && bid.json.id;
  expect(bid.ok, `create bid: ${bid.status} ${bid.text || ''}`.slice(0, 200)).toBeTruthy();
  expect(bidId, 'bid id present').toBeTruthy();
  log.pass('bargain', 'create-bid', `id=${bidId} amount=4800`);

  // 3. boris делает контр-предложение (только владелец листинга).
  const counter = await qaApi.post(`/market/bids/${bidId}/counter`, { amount: 5200, message: 'contr' }, boris);
  expect(counter.ok, `counter: ${counter.status} ${counter.text || ''}`.slice(0, 200)).toBeTruthy();
  log.pass('bargain', 'counter', 'owner countered → 5200');

  // 4. serik принимает контр → создаётся сделка.
  const acc = await qaApi.post(`/market/bids/${bidId}/counter/accept`, {}, serik);
  expect(acc.ok, `accept counter: ${acc.status} ${acc.text || ''}`.slice(0, 200)).toBeTruthy();
  expect(acc.json && acc.json.deal_id, 'deal created').toBeTruthy();
  log.pass('bargain', 'accept-counter', `deal=${acc.json.deal_id}`);

  // 5. История цены — участник видит цепочку proposed → countered → accepted.
  const ev = await qaApi.get(`/market/bids/${bidId}/events`, boris);
  expect(ev.ok, `events (owner): ${ev.status}`).toBeTruthy();
  const kinds = (ev.json && ev.json.events || []).map((e) => e.kind);
  attach('bargain', 'price-events', kinds);
  for (const k of ['proposed', 'countered', 'accepted']) {
    expect(kinds.includes(k), `история цены содержит '${k}' (получено: ${kinds.join(',')})`).toBeTruthy();
  }
  log.pass('bargain', 'price-history', kinds.join(' → '));

  // 6. БЕЗОПАСНОСТЬ: посторонний не читает историю цены (суммы торга).
  if (auditor) {
    const evA = await qaApi.get(`/market/bids/${bidId}/events`, auditor);
    expect(evA.status === 403, `история цены закрыта для постороннего (got ${evA.status})`).toBeTruthy();
    log.pass('bargain', 'price-history-gated', `auditor → ${evA.status}`);
  } else {
    log.p2('bargain', 'price-history-gated', 'нет auditor-сессии — пропуск');
  }

  // 7. ПРИВАТНОСТЬ: телефон оферента не утекает не-владельцу.
  const listAsDriver = await qaApi.get('/market/bids', { ...serik, query: { cargo_id: cargoId } });
  const leaked = (listAsDriver.json && listAsDriver.json.bids || []).some((b) => 'bidder_phone' in b && b.bidder_phone);
  expect(!leaked, 'телефон оферента НЕ отдаётся не-владельцу').toBeTruthy();
  log.pass('bargain', 'phone-privacy', 'bidder_phone скрыт от не-владельца');
});
