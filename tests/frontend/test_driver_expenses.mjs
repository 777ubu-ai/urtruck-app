import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseExpenseAmount, validExpenseDate, makeExpenseBody, localExpenseDate, EXPENSE_CATEGORIES, EXPENSE_CURRENCIES } from '../../src/utils/expenseModel.js';
import { EXPENSE_COPY, getExpenseCopy } from '../../src/utils/expenseCopy.js';

test('expense amounts accept comma and spacing without floating point arithmetic', () => {
  for (const [raw, expected] of [['1 500,20', '1500.20'], ['0.01', '0.01'], ['12','12.00'], ['999999999.99','999999999.99']]) assert.equal(parseExpenseAmount(raw), expected);
  for (const raw of ['0','-1','NaN','Infinity','1.234','1,2,3','1000000000','1e3','']) assert.equal(parseExpenseAmount(raw), null);
});
test('expense dates reject impossible calendar dates and preserve local today', () => {
  assert.equal(validExpenseDate('2024-02-29'), true);
  for (const d of ['2026-02-29','2026-02-30','2026-13-01','2026-1-1','1999-12-31']) assert.equal(validExpenseDate(d), false);
  const now = new Date(2026, 9, 18, 0, 5);
  assert.equal(localExpenseDate(now), '2026-10-18');
});
test('free descriptions and optional bindings roundtrip without chat data', () => {
  const form = { amount:'1,20', currency:'KZT', category:'other', spent_on:'2026-10-18', description:'  Купил хлеб и жвачку  ' };
  assert.deepEqual(makeExpenseBody(form, 'retry-key'), { client_id:'retry-key',amount:'1.20',currency:'KZT',category:'other',description:'Купил хлеб и жвачку',spent_on:'2026-10-18',deal_id:null,vehicle_id:null });
  assert.equal(makeExpenseBody({ ...form, category:'unknown' },'key'), null);
  assert.equal(makeExpenseBody({ ...form, description:'x'.repeat(501) },'key'), null);
});
test('expense labels cover all categories and all four app languages', () => {
  const keys = Object.keys(EXPENSE_COPY.EN).sort();
  for (const [lang, copy] of Object.entries(EXPENSE_COPY)) {
    assert.deepEqual(Object.keys(copy).sort(), keys, lang);
    for (const category of EXPENSE_CATEGORIES) assert.ok(copy[category]);
    assert.ok(Object.values(copy).every(value => typeof value === 'string' && value.length > 0));
  }
  assert.equal(getExpenseCopy('zh'), EXPENSE_COPY.ZH);
  assert.equal(EXPENSE_CURRENCIES.length, new Set(EXPENSE_CURRENCIES).size);
});
function apiHarness() {
  const source = readFileSync('src/utils/expenseAPI.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  let token = 'account-A'; let release; const calls=[];
  const scope = { API_BASE:'https://qa.test/api/v1', storage:{get:async()=>token},
    authedFetch: async (url, init) => { calls.push({url,init}); return await new Promise(resolve => { release = resolve; }); } };
  vm.runInNewContext(source+'\nglobalThis.api=expenseAPI;',scope);
  return {api:scope.api,calls,rotate:()=>{token='account-B';},logout:()=>{token=null;},reply:(status,data)=>release({ok:status===200,status,json:async()=>data})};
}
const flush = async()=>{ for(let n=0;n<4;n++) await new Promise(resolve=>setImmediate(resolve)); };
test('late expense response from previous account is discarded', async()=>{
  const h=apiHarness(); const pending=h.api.list({deal_id:'private A'}); await flush();
  assert.ok(h.calls[0].url.includes('deal_id=private%20A'));
  h.rotate(); h.reply(200,{expenses:[{description:'private'}]});
  const response=await pending; assert.equal(response.ok,false); assert.equal(response.stale,true); assert.equal(response.expenses,undefined);
});
test('expense request without bearer does not send a network request', async()=>{
  const h=apiHarness(); h.logout(); assert.equal((await h.api.list()).status,401); assert.equal(h.calls.length,0);
});
test('save and delete keep idempotency/version payloads and bearer scoping', async()=>{
  const h=apiHarness(); const body={client_id:'same-on-retry',amount:'1.20'};
  const pending=h.api.save(body); await flush();
  assert.equal(h.calls[0].init.method,'POST'); assert.equal(h.calls[0].init.body,JSON.stringify(body));
  assert.equal(h.calls[0].init.headers.Authorization,'Bearer account-A');
  h.reply(200,{ok:true}); await pending;
  const remove=h.api.remove({id:'own/id',version:2}); await flush();
  assert.ok(h.calls[1].url.endsWith('/own%2Fid?version=2')); assert.equal(h.calls[1].init.method,'DELETE');
  h.reply(200,{ok:true}); await remove;
});
test('expense navigation is isolated from chat sends, timers and GPS',()=>{
  const workspace=readFileSync('src/screens/DealWorkspaceScreenV2.js','utf8');
  const entry=workspace.split("key: 'expenses'")[1].split('}] : [])')[0];
  assert.match(entry,/navigation.navigate\('DriverExpenses', \{ dealId \}\)/);
  assert.doesNotMatch(entry,/sendRawText|sendMessage|changeDealStatus/);
  assert.match(workspace,/session\?\.user\?\.role === 'driver' && dealId/);
  const screen=readFileSync('src/screens/DriverExpensesScreen.js','utf8');
  assert.doesNotMatch(screen,/setInterval|expo-location|sendMessage|sendRawText/);
  assert.match(screen,/busyRef\.current = true/);
  assert.match(screen,/data\.filterKey === filterKey/);
  assert.match(screen,/KeyboardAvoidingView/);
  const nav=readFileSync('src/navigation/AppNavigator.js','utf8');
  assert.equal((nav.match(/name="DriverExpenses"/g)||[]).length,(nav.match(/name="VehicleChooser"/g)||[]).length);
});


test('actual plus-menu keeps seven shared actions and adds expenses only for a driver deal', () => {
  const source = readFileSync('src/screens/DealWorkspaceScreenV2.js','utf8');
  const block = source.match(/const PLUS_MENU = \[([\s\S]*?)\];/)[1];
  const noop = () => {};
  for (const [role, dealId, expected] of [['driver','owned-deal',8],['client','owned-deal',7],['driver',null,7]]) {
    const navigations=[];
    const env={GPS_TRACKING_PAUSED:false, session:{user:{role}},dealId,lang:'RU', ui:{},locationSending:false,
      getExpenseCopy:()=>({tripTitle:'Расходы рейса'}),navigation:{navigate:(...args)=>navigations.push(args)},
      setAttachOpen:noop,sendGalleryPhoto:noop,sendCameraPhoto:noop,sendDealShare:noop,openStatusModal:noop,
      sendLocation:noop,pickAndSendDocument:noop,sendContactCard:noop };
    const items=vm.runInNewContext('['+block+']',env);
    const pausedItems=vm.runInNewContext('['+block+']',{...env,GPS_TRACKING_PAUSED:true});
    assert.equal(pausedItems.some(item=>item.key==='location'),false);
    assert.equal(pausedItems.length,expected-1);
    assert.equal(items.length,expected);
    const expense=items.find(item=>item.key==='expenses');
    if(expected===8){ expense.onPress(); assert.equal(navigations[0][0],'DriverExpenses'); assert.equal(navigations[0][1].dealId,dealId); }
    else assert.equal(expense,undefined);
  }
});
