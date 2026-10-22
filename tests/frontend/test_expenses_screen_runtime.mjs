import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getExpenseCopy } from '../../src/utils/expenseCopy.js';
import * as model from '../../src/utils/expenseModel.js';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const code = babel.transformSync(readFileSync('src/screens/DriverExpensesScreen.js','utf8'), {
  babelrc:false, configFile:false, plugins:[require('@babel/plugin-transform-react-jsx'),require('@babel/plugin-transform-modules-commonjs')],
}).code;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const state=[],refs=[],effects=[]; let slot=0,refSlot=0,effectSlot=0,dirty=true,tree;
  let user={id:'driver',role:'driver'}; const calls=[]; const pendingEffects=[];
  const handlers={options:async()=>({ok:true,vehicles:[{id:'v1',license_plate:'LIVE'}],deals:[]}),
    list:async()=>({ok:true,expenses:[],totals:[],total:0,next_cursor:null}),
    deals:async()=>({ok:true,deals:[],next_cursor:null}),save:async()=>({ok:true}),remove:async()=>({ok:true})};
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState:initial=>{const i=slot++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;dirty=true;}];},
    useRef:initial=>{const i=refSlot++;return refs[i]??(refs[i]={current:initial});},useCallback:f=>f};
  const api=Object.fromEntries(Object.keys(handlers).map(name=>[name,(...args)=>{calls.push({name,args});return handlers[name](...args);} ]));
  const mocks={react:React,'react-native':Object.fromEntries(['View','Text','Pressable','TextInput','FlatList','ScrollView','Modal','ActivityIndicator','KeyboardAvoidingView'].map(k=>[k,k])),
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@react-navigation/native':{useFocusEffect:f=>{
      const i=effectSlot++;const deps=[user.id,user.role,state[0],state[1]]; const old=effects[i];
      if(!old || JSON.stringify(old.deps)!==JSON.stringify(deps)){old?.cleanup?.();effects[i]={deps};pendingEffects.push(()=>{effects[i].cleanup=f();});}
    }},'@expo/vector-icons/Feather':'Feather','../utils/AuthContext':{useAuth:()=>({session:{user}})},
    '../utils/useI18n':{useI18n:()=>({lang:'RU'})},'../theme/designV1':{useV1Colors:()=>({text:'#000',textMuted:'#555',surface:'#fff',border:'#ddd',bg:'#fff'})},
    '../utils/expenseAPI':{expenseAPI:api},'../utils/expenseCopy':{getExpenseCopy},'../utils/expenseModel':model,'../components/ui/AppConfirmModal':'AppConfirmModal'};
  mocks['react-native'].StyleSheet={create:s=>s};mocks['react-native'].Platform={OS:'android'};
  const module={exports:{}};vm.runInNewContext(code,{exports:module.exports,module,require:n=>{assert.ok(n in mocks,n);return mocks[n];},Map,console});
  function render(){slot=0;refSlot=0;effectSlot=0;dirty=false;tree=module.exports.default({route:{key:'test'},navigation:{goBack:()=>{}}});pendingEffects.splice(0).forEach(f=>f());}
  function nodes(){const result=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n?.props)return;
    if(n.type==='Modal'&&!n.props.visible)return;result.push(n);walk(n.props.children);
    if(n.type==='FlatList'){walk(n.props.ListHeaderComponent);for(const item of n.props.data||[])walk(n.props.renderItem({item}));walk(n.props.ListFooterComponent);}
  }walk(tree);return result;}
  return {handlers,calls,render,nodes,async flush(){for(let i=0;i<8;i++){if(dirty)render();await tick();}},
    node:id=>{const n=nodes().find(n=>n.props.testID===id);assert.ok(n,id);return n;},
    text:value=>{const n=nodes().find(n=>n.type==='Text'&&n.props.children.includes(value));assert.ok(n,value);return n;},
    setUser:value=>{user=value;dirty=true;},pressText(value){const all=nodes();const text=all.find(n=>n.type==='Text'&&n.props.children.includes(value));const parent=all.find(n=>n.type==='Pressable'&&n.props.children.includes(text));assert.ok(parent,value);return parent.props.onPress();}};
}
const oldDeal={id:'history-0000',from_city:'Старый',to_city:'Рейс',vehicle_id:'v1',vehicle_plate_snapshot:'HISTORY'};
test('поиск старой сделки, следующая страница, выбор в форме и фильтре',async()=>{
  const h=harness();h.handlers.deals=async p=>({ok:true,deals:p.q?[oldDeal]:p.cursor?[oldDeal]:[{...oldDeal,id:'new'}],next_cursor:p.q||p.cursor?null:'page2'});
  await h.flush();h.node('expenses-add').props.onPress();await h.flush();
  h.node('expense-deal').props.onPress();await h.flush();h.node('expenses-deals-more').props.onPress();await h.flush();
  assert.equal(h.calls.filter(c=>c.name==='deals')[1].args[0].cursor,'page2');
  h.node('expenses-deal-search').props.onChangeText('history-0000');await h.flush();
  h.node('expenses-deal-search-submit').props.onPress();await h.flush();
  h.pressText('Старый → Рейс · history-');await h.flush();
  assert.ok(h.node('expense-deal').props.children.some(n=>n.props?.children.includes('Старый → Рейс')));
  assert.ok(h.node('expense-vehicle').props.children.some(n=>n.props?.children.includes('HISTORY')));
  h.node('expense-amount').props.onChangeText('1500');await h.flush();await h.node('expense-save').props.onPress();await h.flush();
  const body=h.calls.find(c=>c.name==='save').args[0];assert.equal(body.deal_id,oldDeal.id);assert.equal(body.vehicle_id,'v1');
  h.node('expenses-filter-deal').props.onPress();await h.flush();h.node('expenses-deal-search').props.onChangeText(oldDeal.id);await h.flush();
  h.node('expenses-deal-search-submit').props.onPress();await h.flush();h.pressText('Старый → Рейс · history-');await h.flush();
  assert.equal(h.calls.filter(c=>c.name==='list').at(-1).args[0].deal_id,oldDeal.id);
  assert.equal(h.calls.filter(c=>c.name==='options').at(-1).args[0],oldDeal.id);
});
test('ошибка поиска допускает повтор, ответ после закрытия или смены аккаунта игнорируется',async()=>{
  const h=harness();h.handlers.deals=async()=>({ok:false,status:0});await h.flush();h.node('expenses-filter-deal').props.onPress();await h.flush();
  assert.ok(h.nodes().some(n=>n.props.accessibilityRole==='alert'));
  let reply;h.handlers.deals=()=>new Promise(resolve=>{reply=resolve;});h.node('expenses-deal-search-submit').props.onPress();await h.flush();
  h.pressText('Закрыть');await h.flush();reply({ok:true,deals:[oldDeal]});await h.flush();assert.ok(!h.nodes().some(n=>n.props.testID==='expenses-deal-search'));
  h.node('expenses-filter-deal').props.onPress();await h.flush();h.setUser({id:'other',role:'driver'});await h.flush();reply({ok:true,deals:[oldDeal]});await h.flush();
  assert.ok(!h.nodes().some(n=>n.type==='Text'&&n.props.children.includes('Старый → Рейс · history-')));
});
test('список использует cursor, убирает повтор ID и при обновлении сбрасывает страницу',async()=>{
  const h=harness();h.handlers.list=async p=>({ok:true,expenses:p.cursor?[{id:'one',category:'food',amount:'1',currency:'KZT'},{id:'two',category:'food',amount:'2',currency:'KZT'}]:[{id:'one',category:'food',amount:'1',currency:'KZT'}],total:2,totals:[],next_cursor:p.cursor?null:'cursor-one'});
  await h.flush();await h.pressText('Показать ещё');await h.flush();
  assert.equal(h.calls.filter(c=>c.name==='list').at(-1).args[0].cursor,'cursor-one');
  assert.equal(h.nodes().filter(n=>n.props.testID==='expense-record').length,2);
  await h.node('expenses-refresh').props.onPress();await h.flush();assert.equal(h.calls.filter(c=>c.name==='list').at(-1).args[0].offset,0);
});
test('двойное сохранение блокируется, повтор после потери ответа использует тот же client_id',async()=>{
  const h=harness();await h.flush();h.node('expenses-add').props.onPress();await h.flush();h.node('expense-amount').props.onChangeText('0.01');await h.flush();
  let reply;h.handlers.save=()=>new Promise(resolve=>{reply=resolve;});const save=h.node('expense-save').props.onPress;
  const first=save();await save();assert.equal(h.calls.filter(c=>c.name==='save').length,1);
  reply({ok:false,status:0});await first;await h.flush();assert.equal(h.node('expense-amount').props.value,'0.01');
  h.handlers.save=async()=>({ok:true});await h.node('expense-save').props.onPress();await h.flush();
  const calls=h.calls.filter(c=>c.name==='save');assert.equal(calls.length,2);assert.equal(calls[0].args[0].client_id,calls[1].args[0].client_id);
});
test('редактирование хранит исторические подписи; снятие машины очищает номер',async()=>{
  const h=harness();const item={id:'expense-history',version:1,amount:'10.00',currency:'KZT',category:'repair',spent_on:'2026-10-18',description:'История',deal_id:'old-deal',deal_label:'Архив → Рейс',vehicle_id:'deleted',vehicle_plate:'OLD'};
  h.handlers.list=async()=>({ok:true,expenses:[item],totals:[],total:1});await h.flush();h.pressText('Изменить расход');await h.flush();
  assert.ok(h.node('expense-deal').props.children.some(n=>n.props?.children.includes('Архив → Рейс')));
  assert.ok(h.node('expense-vehicle').props.children.some(n=>n.props?.children.includes('OLD')));
  h.node('expense-amount').props.onChangeText('11');await h.flush();await h.node('expense-save').props.onPress();await h.flush();
  assert.equal(h.calls.filter(c=>c.name==='save').at(-1).args[0].vehicle_id,'deleted');
  item.deal_id=null;item.deal_label='';await h.node('expenses-refresh').props.onPress();await h.flush();h.pressText('Изменить расход');await h.flush();
  h.node('expense-vehicle').props.onPress();await h.flush();h.pressText('Без машины');await h.flush();
  assert.ok(h.node('expense-vehicle').props.children.some(n=>n.props?.children.includes('Без машины')));
  await h.node('expense-save').props.onPress();await h.flush();assert.equal(h.calls.filter(c=>c.name==='save').at(-1).args[0].vehicle_id,null);
});
