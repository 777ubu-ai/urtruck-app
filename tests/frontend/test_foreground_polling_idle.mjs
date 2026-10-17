import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('src/utils/foregroundPolling.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const flush = async () => { for (let i=0;i<4;i++) await new Promise(r=>setImmediate(r)); };
function harness(initial = 'active') {
  const listeners = new Set(), timers = new Map(); let seq=0;
  const app = { currentState: initial, addEventListener: (_, cb) => { listeners.add(cb); return {remove:()=>listeners.delete(cb)}; } };
  const clock = { setInterval: (cb,ms) => { const id=++seq; timers.set(id,{cb,ms}); return id; }, clearInterval:id=>timers.delete(id) };
  const scope = { AppState: app, globalThis: clock, Promise };
  const api = vm.runInNewContext(source+'\n({createForegroundInterval,setForegroundInterval,clearForegroundInterval})',scope);
  return {app,clock,timers,api,listeners,change: state=>{app.currentState=state; for(const cb of [...listeners])cb(state);}};
}
test('idle: старт в фоне не создаёт ни таймера, ни запроса; возврат запускает один refresh', async()=>{
  const h=harness('background'); let calls=0;
  const stop=h.api.createForegroundInterval(()=>calls++,12000,h.app,h.clock);
  assert.equal(h.timers.size,0); assert.equal(calls,0);
  h.change('active'); assert.equal(calls,1); assert.equal(h.timers.size,1);
  h.change('active'); assert.equal(calls,1); stop();
});
test('idle: сворачивание удаляет таймер; старый callback запрещён даже после возврата', async()=>{
  const h=harness(); let calls=0; const stop=h.api.createForegroundInterval(()=>calls++,10000,h.app,h.clock);
  const old=[...h.timers.values()][0].cb;
  h.change('inactive'); assert.equal(h.timers.size,0); old(); assert.equal(calls,0);
  h.change('background'); h.change('active'); assert.equal(calls,1);
  await flush(); old(); assert.equal(calls,1);
  [...h.timers.values()][0].cb(); assert.equal(calls,2);
  stop(); await flush(); h.change('active'); assert.equal(h.timers.size,0); assert.equal(h.listeners.size,0);
});
test('idle: медленный poll не создаёт параллельную очередь запросов', async()=>{
  const h=harness(); let calls=0,resolve;
  const stop=h.api.createForegroundInterval(()=>{calls++;return new Promise(r=>{resolve=r;});},3000,h.app,h.clock);
  const tick=[...h.timers.values()][0].cb; tick();tick();tick(); assert.equal(calls,1);
  h.change('background');h.change('active'); assert.equal(calls,1);
  resolve();await flush(); [...h.timers.values()][0].cb(); assert.equal(calls,2); resolve();stop();
});
test('idle: настоящий unread hook не отправляет запрос из read-event в фоне', async()=>{
  const h=harness('background');let effect,read,calls=0,count=0;
  const scope={AppState:h.app,useState:()=>[count,v=>{count=v;}],useRef:()=>({current:null}),useEffect:cb=>{effect=cb;},
    setInterval:h.api.setForegroundInterval,clearInterval:h.api.clearForegroundInterval,
    notificationsAPI:{unread:async()=>{calls++;return {unread:4};}},chatAPI:{unread:async()=>({unread:0})},
    subscribeNotifRead:cb=>{read=cb;return ()=>{};},subscribeChatRead:()=>()=>{},Promise};
  const hook=readFileSync('src/utils/useUnreadNotifications.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  vm.runInNewContext(hook+'\nuseUnreadNotifications();',scope);const cleanup=effect();
  await flush();read();await flush();assert.equal(calls,0);assert.equal(h.timers.size,0);
  h.change('active');await flush();assert.equal(calls,1);assert.equal(count,4);
  h.change('background');read();await flush();assert.equal(calls,1);assert.equal(h.timers.size,0);
  cleanup();assert.equal(h.listeners.size,0);
});
