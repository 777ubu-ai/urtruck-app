import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const begin = source.indexOf('  const askConfirm = React.useCallback(');
const end = source.indexOf('\n  React.useEffect(', begin);
assert.ok(begin > 0 && end > begin);
function harness() {
  const state = { dialog: null };
  const env = {
    React: { useCallback: fn => fn },
    t: value => value, mounted: { current: true },
    tripActionScope: { current: { focused: true, generation: 0 } },
    confirmDialogRef: { current: null },
    setConfirmDialog: value => { state.dialog = typeof value === 'function' ? value(state.dialog) : value; },
  };
  const callbacks = new Function(...Object.keys(env), source.slice(begin, end) + '\nreturn { askConfirm, settleConfirm };')(...Object.values(env));
  return { ...callbacks, state, env };
}

test('подтверждение после blur не разрешает статусный запрос', async () => {
  const h = harness(); const pending = h.askConfirm('Доставлен');
  h.env.tripActionScope.current.focused = false;
  h.env.tripActionScope.current.generation++;
  h.settleConfirm(true);
  assert.equal(await pending, false);
});
test('старое подтверждение после ухода и возврата не разрешает действие', async () => {
  const h = harness(); const pending = h.askConfirm('Доставлен');
  h.env.tripActionScope.current.generation++;
  h.settleConfirm(true);
  assert.equal(await pending, false);
});
test('после unmount подтверждение не разрешает действие', async () => {
  const h = harness(); const pending = h.askConfirm('Доставлен');
  h.env.mounted.current = false;
  h.settleConfirm(true);
  assert.equal(await pending, false);
});
test('повторный запрос не заменяет первый dialog и не оставляет потерянный promise', async () => {
  const h = harness(); const first = h.askConfirm('Доставлен');
  const original = h.state.dialog;
  const second = h.askConfirm('Отменить');
  assert.equal(h.state.dialog, original);
  h.settleConfirm(true);
  assert.equal(await first, true);
  assert.equal(await second, false);
});
test('актуальное подтверждение/отмена завершаются один раз и дают следующий запрос', async () => {
  const h = harness();
  const no = h.askConfirm('Доставлен'); h.settleConfirm(false); assert.equal(await no, false);
  const yes = h.askConfirm('Получен'); h.settleConfirm(true); h.settleConfirm(true);
  assert.equal(await yes, true); assert.equal(h.state.dialog, null);
});
test('скрытый или размонтированный экран не открывает новое подтверждение', async () => {
  for (const reason of ['blur', 'unmount']) {
    const h = harness();
    if (reason === 'blur') h.env.tripActionScope.current.focused = false;
    else h.env.mounted.current = false;
    const result = h.askConfirm('Доставлен');
    assert.equal(h.state.dialog, null);
    assert.equal(await result, false);
  }
});

test('старый обработчик dialog не подтверждает следующий dialog', async () => {
  const h = harness();
  const first = h.askConfirm('Доставлен'); const old = h.state.dialog;
  h.settleConfirm(false, old); assert.equal(await first, false);
  const second = h.askConfirm('Отменить'); const current = h.state.dialog;
  h.settleConfirm(true, old);
  assert.equal(h.state.dialog, current);
  h.settleConfirm(false, current); assert.equal(await second, false);
});

test('реальный runNextAction не вызывает API после ухода из сделки', async () => {
  const h = harness(); const calls = [];
  const start = source.indexOf('  const runNextAction = React.useCallback(');
  const stop = source.indexOf('\n  const recipientId', start);
  const env = { ...h.env, askConfirm: h.askConfirm, nextAction: { key: 'delivered', label: 'Доставлен' },
    startTrip: async () => calls.push('start'),
    changeDealStatus: async status => calls.push(status) };
  const run = new Function(...Object.keys(env), source.slice(start, stop) + '\nreturn runNextAction;')(...Object.values(env));
  const pending = run();
  h.env.tripActionScope.current.focused = false; h.env.tripActionScope.current.generation++;
  h.settleConfirm(true);
  await pending;
  assert.deepEqual(calls, []);
});

test('focus cleanup закрывает panel и завершает ожидающее действие отменой', async () => {
  const h = harness(); const pending = h.askConfirm('Доставлен');
  const start = source.indexOf('  useFocusEffect(React.useCallback(() => {', source.indexOf('const tripActionScope'));
  const stop = source.indexOf('  const recordStartRef', start);
  let cleanup, panel = true;
  const env = { ...h.env, useFocusEffect: fn => { cleanup = fn(); }, dealId: 'deal-A', roomId: 'room-A',
    session: { user: { id: 'driver-A' } }, setStatusModalOpen: value => { panel = value; } };
  new Function(...Object.keys(env), source.slice(start, stop))(...Object.values(env));
  cleanup();
  assert.equal(h.state.dialog, null); assert.equal(panel, false);
  assert.equal(await pending, false);
  assert.equal(h.env.tripActionScope.current.focused, false);
});

test('реальный runNextAction после актуального Да отправляет ровно один статус', async () => {
  const h = harness(); const calls = [];
  const start = source.indexOf('  const runNextAction = React.useCallback(');
  const stop = source.indexOf('\n  const recipientId', start);
  const env = { ...h.env, askConfirm: h.askConfirm, nextAction: { key: 'delivered', label: 'Доставлен' },
    startTrip: async () => calls.push('start'), changeDealStatus: async status => calls.push(status) };
  const run = new Function(...Object.keys(env), source.slice(start, stop) + '\nreturn runNextAction;')(...Object.values(env));
  const first = run(); const second = run();
  h.settleConfirm(true); await Promise.all([first, second]);
  assert.deepEqual(calls, ['delivered']);
});

test('blur между нажатием Да и async-продолжением не отправляет статус', async () => {
  const h = harness(); const calls = [];
  const start = source.indexOf('  const runNextAction = React.useCallback(');
  const stop = source.indexOf('\n  const recipientId', start);
  const env = { ...h.env, askConfirm: h.askConfirm, nextAction: { key: 'delivered', label: 'Доставлен' },
    startTrip: async () => calls.push('start'), changeDealStatus: async status => calls.push(status) };
  const run = new Function(...Object.keys(env), source.slice(start, stop) + '\nreturn runNextAction;')(...Object.values(env));
  const pending = run(); h.settleConfirm(true);
  h.env.tripActionScope.current.focused = false; h.env.tripActionScope.current.generation++;
  await pending; assert.deepEqual(calls, []);
});
test('cancelDeal повторно проверяет scope после подтверждения', async () => {
  const h = harness(); const calls = [];
  const start = source.indexOf('  const cancelDeal = async () => {');
  const stop = source.indexOf('\n  const openMap', start);
  const env = { ...h.env, askConfirm: h.askConfirm, ui: { cancelDeal: 'Отменить', cancelDealConfirm: 'Подтвердите' },
    setStatusModalOpen() {}, changeDealStatus: async status => calls.push(status) };
  const run = new Function(...Object.keys(env), source.slice(start, stop) + '\nreturn cancelDeal;')(...Object.values(env));
  const pending = run(); h.settleConfirm(true);
  h.env.tripActionScope.current.generation++;
  await pending; assert.deepEqual(calls, []);
});
