import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import sucrase from 'sucrase';
import { parseWeightTonsInput } from '../../src/utils/normalizers.js';

// Выполняется целый компонент и его реальные обработчики, без проверки строк.
function cargoHarness({ role = 'client', routeRole = 'client', serverRole = role, kind = 'cargo' } = {}) {
  const state = [], refs = [], calls = [];
  let cursor = 0, refCursor = 0, token = 'test-owner-a';
  let auth = { session: { user: { id: 'owner-a', role } }, refreshLevel: async () => {} };
  const colors = new Proxy({ main: '#168759' }, { get: (o, k) => o[k] || '#ffffff' });
  const react = { ...React, useState: value => { const i=cursor++; if(!(i in state))state[i]=value; return [state[i], v=>{state[i]=typeof v==='function'?v(state[i]):v;}]; },
    useRef: value => { const i=refCursor++; return refs[i] ||= {current:value}; }, useMemo: f=>f(), useEffect:()=>{}, useCallback:f=>f };
  const generic = name => ({ __esModule:true, default:name });
  const regAPI = { getToken:async()=>token, publicationAccount:async()=>({id:auth.session.user.id,role:serverRole,verification_level:1}) };
  const marketAPI = { createTrip:async p=>{calls.push(['trip',p]);return {ok:true,id:'trip-test'};}, createCargo:async p=>{calls.push(['create',p]);return {ok:true,id:'cargo-test'};},uploadCargoPhoto:async()=>({photo_key:'test-key'}) };
  const req = name => {
    if(name==='react')return react;
    if(name==='react-native')return {View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',ScrollView:'ScrollView',StyleSheet:{create:x=>x}};
    if(name.endsWith('/useI18n'))return {useI18n:()=>({t:x=>x,lang:'RU'})};
    if(name.endsWith('/Toast'))return {useToast:()=>({toast:(...x)=>calls.push(['toast',...x])})};
    if(name.endsWith('/AuthContext'))return {useAuth:()=>auth};
    if(name.endsWith('/usePublicationDraft'))return {usePublicationDraft:()=>({ready:true,save:async()=>{},prepare:async()=>({clientId:'test-operation'}),snapshot:async(id,p)=>({...p,client_id:id}),resetOperation:async()=>{calls.push(['reset-operation']);},clear:async()=>{calls.push(['draft-clear']);}})};
    if(name.endsWith('/registration'))return {regAPI};
    if(name.endsWith('/marketAPI'))return {marketAPI};
    if(name.endsWith('/publicationSession'))return publication;
    if(name.endsWith('/designV1'))return {useV1Colors:()=>colors,useShipperCeramicColors:()=>colors,v1AccentFor:()=>colors,v1Colors:colors,v1Spacing:{sm:8,md:16},v1Typography:{h1:{},bodyMd:{}},v1Radius:{field:8}};
    if(name.endsWith('/places'))return {cleanPlaceName:x=>x,localizePlace:x=>x};
    if(name.endsWith('/cargoTypes'))return {addCustomCargoType:()=>{}};
    if(name.endsWith('/dateInput'))return {normalizeDateInput:x=>x==='25.10.2026'?'2026-10-25':x};
    if(name.endsWith('/normalizers'))return {parseWeightTonsInput};
    if(name.endsWith('/truckConstants'))return {TRUCK_KEYS:['tent']};
    if(name.endsWith('/PhotoGallery'))return {PhotoPicker:'PhotoPicker'};
    return generic(name.split('/').at(-1));
  };
  const publicationPath='src/utils/publicationSession.js';
  const publication=fs.existsSync(publicationPath)?awaitlessModule(publicationPath):{};
  function awaitlessModule(path) { const e={};vm.runInNewContext(sucrase.transform(fs.readFileSync(path,'utf8'),{transforms:['imports']}).code,{exports:e,require:req});return e; }
  const exports = {};
  const code=sucrase.transform(fs.readFileSync(kind === 'trip' ? 'src/screens/CreateTripScreen.js' : 'src/screens/CreateCargoScreen.js','utf8'),{transforms:['jsx','imports']}).code;
  vm.runInNewContext(code,{exports,require:req,console,setTimeout,clearTimeout});
  function render(){cursor=0;refCursor=0;return exports.default({route:{params:{role:routeRole}},navigation:{reset:x=>calls.push(['nav',x]),navigate:(...x)=>calls.push(['navigate',...x]),goBack:()=>{}}});}
  function elements(node, result=[]){if(Array.isArray(node))node.forEach(n=>elements(n,result));else if(node?.props){result.push(node);elements(node.props.children,result);if(node.props.footer)elements(node.props.footer,result);}return result;}
  const find = predicate => {const el=elements(render()).find(predicate);assert.ok(el,'Элемент формы отсутствует');return el;};
  const byId=id=>find(x=>x.props.testID===id);
  const byType=type=>elements(render()).filter(x=>x.type===type);
  function fill(){
    const pickers=byType('LocationPickerModal');
    pickers[0].props.onSelect('Хоргос',{country:'CN',type:'city',name:'Хоргос'});
    pickers[1].props.onSelect('Алматы',{country:'KZ',type:'city',name:'Алматы'});
    byId('cargo-desc-input').props.onChange('электросамокаты');
    byId('cargo-weight-field').props.onChangeText('25');byId('cargo-volume-field').props.onChangeText('150');
    byId('cargo-price-field').props.onChangeText('4500');
    byId('cargo-pickup-date-open').props.onPress();
    byType('DatePicker')[0].props.onChange('25.10.2026');
    byId('cargo-pay-any').props.onPress();
  }
  function fillTrip(){
    const pickers=byType('LocationPickerModal');pickers[0].props.onSelect('Хоргос');pickers[1].props.onSelect('Алматы');
    byType('Field').find(x=>x.props.label==='departure').props.onPress();byType('DatePicker')[0].props.onChange('25.10.2026');
    byType('TruckTypeGrid')[0].props.onSelect('tent');byId('trip-price-input').props.onChangeText('4500');
  }
  return {calls,fill,fillTrip,byId,byType,render,marketAPI,regAPI,setAuth:v=>{auth=v;},setToken:v=>{token=v;}};
}

test('устаревший route client не открывает форму груза водителю',()=>{
 const h=cargoHarness({role:'driver',routeRole:'client'});
 assert.equal(h.byType('CargoTypeInput').length,0);
 assert.equal(h.byId('publication-open-correct-role').props.label,'publish_route');
});

test('контрольный груз отправляется грузоотправителем и сохраняет поля',async()=>{
 const h=cargoHarness();h.fill();await h.byId('cargo-submit-button').props.onPress();
 const p=h.calls.find(x=>x[0]==='create')?.[1];assert.ok(p);
 assert.equal(p.from_city,'Хоргос');assert.equal(p.to_city,'Алматы');assert.equal(p.weight_tons,25);assert.equal(p.volume_m3,150);
 assert.equal(p.price,4500);assert.equal(p.currency,'USD');assert.equal(p.payment_type,'any');assert.equal(p.pickup_date,'2026-10-25');
 assert.equal(h.calls.filter(x=>x[0]==='nav').length,1);
});

test('сбой сети сохраняет заполненную форму для повторной отправки',async()=>{
 const h=cargoHarness();h.fill();let fail=true;
 h.marketAPI.createCargo=async p=>{h.calls.push(['attempt',p]);if(fail)throw Error('offline');return {ok:true,id:'cargo-test'};};
 await h.byId('cargo-submit-button').props.onPress();
 assert.equal(h.byId('cargo-price-field').props.value,'4500');assert.equal(h.calls.filter(x=>x[0]==='nav').length,0);
 fail=false;await h.byId('cargo-submit-button').props.onPress();assert.equal(h.calls.filter(x=>x[0]==='nav').length,1);
});

test('серверная роль driver блокирует POST при локальном client',async()=>{
 const h=cargoHarness({serverRole:'driver'});h.fill();await h.byId('cargo-submit-button').props.onPress();
 assert.equal(h.calls.filter(x=>x[0]==='create').length,0);
 assert.equal(h.byId('cargo-price-field').props.value,'4500');
});


test('проверка сервера при плохой сети оставляет форму и допускает повтор',async()=>{
 const h=cargoHarness();h.fill();const account=h.regAPI.publicationAccount;
 h.regAPI.publicationAccount=async()=>{throw Error('offline');};await h.byId('cargo-submit-button').props.onPress();
 assert.equal(h.calls.filter(x=>x[0]==='create').length,0);assert.equal(h.byId('cargo-desc-input').props.value,'электросамокаты');
 h.regAPI.publicationAccount=account;await h.byId('cargo-submit-button').props.onPress();assert.equal(h.calls.filter(x=>x[0]==='create').length,1);
});

test('обновление той же сессии не очищает форму',()=>{
 const h=cargoHarness();h.fill();h.setAuth({session:{user:{id:'owner-a',role:'client',name:'Обновлённый профиль'}},refreshLevel:async()=>{}});h.render();
 assert.equal(h.byId('cargo-price-field').props.value,'4500');assert.equal(h.byId('cargo-desc-input').props.value,'электросамокаты');
});

test('смена владельца во время проверки аккаунта отменяет публикацию',async()=>{
 const h=cargoHarness();h.fill();let finish;h.regAPI.publicationAccount=()=>new Promise(r=>{finish=r;});
 const job=h.byId('cargo-submit-button').props.onPress();await new Promise(r=>setImmediate(r));
 h.setAuth({session:{user:{id:'owner-b',role:'client'}},refreshLevel:async()=>{}});h.setToken('test-owner-b');h.render();
 finish({id:'owner-a',role:'client'});await job;assert.equal(h.calls.filter(x=>x[0]==='create').length,0);assert.equal(h.calls.filter(x=>x[0]==='nav').length,0);
});

test('поздний успех создания не перенаправляет новый аккаунт',async()=>{
 const h=cargoHarness();h.fill();let finish;h.marketAPI.createCargo=()=>new Promise(r=>{finish=r;});
 const job=h.byId('cargo-submit-button').props.onPress();await new Promise(r=>setImmediate(r));
 h.setAuth({session:{user:{id:'owner-b',role:'client'}},refreshLevel:async()=>{}});h.setToken('test-owner-b');h.render();
 finish({id:'old-cargo',ok:true});await job;assert.equal(h.calls.filter(x=>x[0]==='draft-clear').length,1);assert.equal(h.calls.filter(x=>x[0]==='nav').length,0);assert.equal(h.calls.filter(x=>x[0]==='toast').length,0);
});

test('два синхронных нажатия публикации рейса дают один POST',async()=>{
 const h=cargoHarness({kind:'trip',role:'driver'});h.fillTrip();let finish;
 h.marketAPI.createTrip=async p=>{h.calls.push(['trip',p]);return new Promise(r=>{finish=r;});};
 const submit=h.byId('trip-submit-button').props.onPress;const first=submit();await submit();await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.filter(x=>x[0]==='trip').length,1);finish({id:'trip-test',ok:true});await first;
 assert.equal(h.calls.filter(x=>x[0]==='nav').length,1);
});

test('дата рейса переносится в узком поле и сохраняется полностью после выбора',async()=>{
 const h=cargoHarness({kind:'trip',role:'driver'});h.fillTrip();
 const date=h.byType('Field').find(x=>x.props.label==='departure');
 assert.equal(date.props.valueNumberOfLines,0);
 assert.equal(date.props.value,'25.10.2026');
 await h.byId('trip-submit-button').props.onPress();
 assert.equal(h.calls.find(x=>x[0]==='trip')[1].departure,'2026-10-25');
});


test('невалидная сумма отмечается в конкретном поле без POST',async()=>{
 const h=cargoHarness();h.fill();h.byId('cargo-price-field').props.onChangeText('0');await h.byId('cargo-submit-button').props.onPress();
 assert.equal(h.calls.filter(x=>x[0]==='create').length,0);assert.ok(h.calls.some(x=>x[0]==='toast'&&x[1]==='val_price_required'));
 assert.equal(h.byId('cargo-price-field').props.value,'0');
});

for (const kind of ['cargo', 'trip']) test(`${kind}: конфликт открывает исходное объявление, reset явный и не публикует`, async()=>{
 const h=cargoHarness({kind,role:kind==='cargo'?'client':'driver'});
 kind==='cargo'?h.fill():h.fillTrip();
 h.marketAPI[kind==='cargo'?'createCargo':'createTrip']=async()=>({ok:false,code:'PUBLICATION_IDEMPOTENCY_CONFLICT',originalResult:{ok:true,id:'original-id'}});
 await h.byId(kind==='cargo'?'cargo-submit-button':'trip-submit-button').props.onPress();
 h.byId('publication-open-original').props.onPress();
 const nav=h.calls.find(x=>x[0]==='navigate');assert.equal(nav[1],kind==='cargo'?'CargoDetail':'TripDetail');assert.equal(nav[2][kind==='cargo'?'cargoId':'tripId'],'original-id');
 await h.byId('publication-new-operation').props.onPress();
 assert.equal(h.calls.filter(x=>x[0]==='reset-operation').length,1);
 assert.equal(h.byId(kind==='cargo'?'cargo-price-field':'trip-price-input').props.value,'4500');
 assert.equal(h.calls.filter(x=>x[0]==='nav').length,0);
});
