import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const source = readFileSync('src/components/PlannedRouteSummary.js','utf8');
const code = babel.transformSync(source.replace(/^import .*;\n/gm,'').replace('export default function','function'), {babelrc:false,configFile:false,plugins:[require('@babel/plugin-transform-react-jsx')]}).code;
const tick = () => new Promise(r=>setImmediate(r));
function fixture(response={ok:true,distance_m:1500500,duration_s:7200},pending=false) {
 let cursor=0,ec=0,requests=0,resolve,opts;const values=[],effects=[],listeners=new Set(),summaries=[];
 const app={currentState:'active',addEventListener:(_,cb)=>{listeners.add(cb);return {remove:()=>listeners.delete(cb)};}};
 const scope={React:{createElement:(type,props,...children)=>({type,props,children}),useState:v=>{const n=cursor++;if(!(n in values))values[n]=v;return [values[n],v=>{values[n]=v;}];},useRef:v=>{const n=cursor++;return values[n]??={current:v};},useMemo:(cb)=>cb(),useEffect:(cb,deps)=>{const n=ec++,old=effects[n];if(old&&deps.every((d,i)=>Object.is(d,old.deps[i])))return;old?.cleanup?.();effects[n]={cb,deps};}},
  AppState:app,AbortController,StyleSheet:{create:v=>v},View:'View',Text:'Text',pausedLocationCopy:{RU:'paused'},useTheme:()=>({theme:{}}),useI18n:()=>({lang:'RU',t:translate}),
  routingAPI:{roadRoute:async(points,vehicle,options)=>{requests++;opts={points,vehicle,...options};if(pending)return new Promise(r=>{resolve=r;});return response;}}};
 function translate(k){return k;}
 vm.runInNewContext(code+'\nglobalThis.component=PlannedRouteSummary;',scope);
 const onRouteSummary=s=>summaries.push(s);
 function render(enabled=true,points=[[43,76],[55,37]]){cursor=0;ec=0;const tree=scope.component({routePoints:points,vehicle:{payload_t:20},enabled,onRouteSummary});for(const e of effects)if(e.cb){const cb=e.cb;e.cb=null;e.cleanup=cb();}return tree;}
 return {render,requests:()=>requests,opts:()=>opts,summaries,background:()=>{app.currentState='background';for(const cb of [...listeners])cb('background');},resolve:v=>resolve?.(v),unmount:()=>effects.forEach(e=>e.cleanup?.())};
}
test('маршрут загружается один раз, передаёт payload и не создаёт карту или таймеры',async()=>{
 const h=fixture();h.render();await tick();const tree=h.render();h.render();await tick();
 assert.equal(h.requests(),1);assert.equal(h.opts().vehicle.payload_t,20);assert.equal(h.opts().timeoutMs,15000);
 assert.equal(h.summaries.at(-1).totalDistanceText,'1501 km_short');assert.equal(h.summaries.at(-1).isRemaining,false);
 assert.equal(tree.type,'View');assert.doesNotMatch(source,/setInterval|setTimeout|expo-location|YaMap|watchPosition/);h.unmount();
});
test('скрытый экран не загружает маршрут; уход отменяет запрос; поздний ответ не появляется',async()=>{
 const h=fixture(undefined,true);h.render(false);assert.equal(h.requests(),0);h.render(true);assert.equal(h.requests(),1);
 const signal=h.opts().signal;h.render(false);assert.equal(signal.aborted,true);h.resolve({ok:true,distance_m:1000});await tick();h.render(false);assert.equal(h.summaries.at(-1),null);h.unmount();
});
test('фон отменяет маршрут без автоматических повторов',async()=>{
 const h=fixture(undefined,true);h.render();h.background();assert.equal(h.opts().signal.aborted,true);h.resolve({ok:true,distance_m:1000});await tick();h.render();assert.equal(h.requests(),1);assert.equal(h.summaries.at(-1),null);h.unmount();
});
for(const response of [{ok:false},{ok:true},{ok:true,distance_m:null},{ok:true,distance_m:-1},{ok:true,distance_m:'bad'}]) test('неподтверждённый километраж не подставляется: '+JSON.stringify(response),async()=>{
 const h=fixture(response);h.render();await tick();h.render();assert.equal(h.summaries.at(-1),null);h.unmount();
});
test('пауза включена по умолчанию; текст доступен на четырёх языках',async()=>{
 const policy=await import('../../src/utils/locationPolicy.js');assert.equal(policy.GPS_TRACKING_PAUSED,true);for(const lang of ['RU','KK','ZH','EN'])assert.ok(policy.pausedLocationCopy[lang]);
});
