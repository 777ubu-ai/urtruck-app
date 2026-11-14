import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sucrase from 'sucrase';
import { saveSessionRecovery, readSessionRecovery, completeSessionRecovery, restoreSharedWork, clearSharedAndOwnedDrafts } from '../../src/utils/sessionRecovery.js';
import { storage as realStorage } from '../../src/utils/storage.js';
import { enqueueOutbox, flushOutbox, clearOutbox, clearOutboxForUser, pauseOutbox, outboxCount } from '../../src/utils/outbox.js';
import { regAPI as realRegAPI } from '../../src/utils/registration.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const origin = 'https://urtruck.kz/api/v1';
function registrationMe(status) {
  const text = fs.readFileSync('src/utils/registration.js', 'utf8');
  const method = text.slice(text.indexOf('  async me('), text.indexOf('  // Raw status'));
  const api = vm.runInNewContext('({' + method + '})', {
    BASE: origin + '/register', LEVEL_KEY: 'level',
    fetchAccount: async()=>({status,ok:status===200,json:async()=>({id:'A',verification_level:1})}),
    fetch: async () => ({ status, ok: status === 200, json: async () => ({ id: 'A', verification_level: 1 }) }),
    storage: { set: async () => {} },
  });
  api.getToken = async () => 'rejected';
  return api;
}

function harness(existingData = null, { fakeTimers = false } = {}) {
  const data = existingData || new Map([
    ['ur_reg_token', 'token-A'], ['ur_session', JSON.stringify({ apiBase: origin, user: { id: 'A', role: 'client' } })],
    ['ur_verification_level', '1'], ['ur_draft_registration', '{"name":"Сохранить"}'],
    ['ur_publication_draft_v1:cargo:A', '{"cargo_desc":"Мой черновик"}'],
    ['ur_chat_outbox', '[{"clientId":"unsent","userId":"A","payload":{"text":"Не отправлено"}}]'],
  ]);
  const effects = [], slots = [], cache = new Map(), timers = new Map(), pauses = [], flushes = []; let cursor = 0, timerId = 0;
  const tracking = { stop: async () => ({ok:true}) };
  const storage = { get: async k => data.get(k) ?? null, set: async (k,v) => data.set(k,v), remove: async k => data.delete(k),
    keys: async () => [...data.keys()], removeByPrefix: async p => [...data.keys()].filter(k => k.startsWith(p)).forEach(k => data.delete(k)) };
  const react = { createContext: () => ({ Provider: 'Provider' }), createElement: (type,props,...children) => ({ type,props:{...props,children} }),
    useState: initial => { const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}]; },
    useRef: initial => { const i=cursor++; return slots[i] ||= {current:initial}; },
    useCallback: fn => fn, useEffect: fn => { const i=cursor++; if (!(i in slots)) { slots[i]=true; effects.push(fn); } }, useContext:()=>{} };
  const regAPI = { getToken:()=>storage.get('ur_reg_token'), getLevel:async()=>1,
    clearToken:()=>storage.remove('ur_reg_token'), flushPendingLogout:async()=>({ok:true}),
    me:async()=>({id:'A',role:'client',verification_level:1}), profile:async()=>null, validateToken:async()=>401 };
  const require = name => {
    if (name==='react') return react;
    if (name==='./storage') return {storage,durableStorage:storage};
    if (name.endsWith('/env')) return {API_BASE:origin};
    if (name==='./registration') return {regAPI};
    if (name==='./publicationSession') return {sessionRole:s=>s.user.role};
    if (['./authMutation','./authEvents','./sessionRecovery'].includes(name)) return load('src/utils/'+name.slice(2)+'.js');
    if (name==='./backgroundLocation') return {stopBackgroundTrackingForLogout:(...args)=>tracking.stop(...args),restoreBackgroundTrackingForLogoutFailure:async()=>({ok:true}),clearBackgroundLocationSampleForLogout:async()=>({ok:true})};
    if (name==='./outbox') return {clearOutboxForUser:async()=>{throw Error('Нельзя удалять очередь при401');},pauseOutbox:value=>pauses.push(value),flushOutbox:async(_,id)=>{flushes.push(id);return 0;}};
    if (name==='./offlineQueue') return {clearQueue:async()=>{throw Error('Нельзя удалять очередь при401');},pauseQueue:()=>{}};
    return new Proxy({}, {get:()=>()=>{}});
  };
  function load(path) {
    if(cache.has(path))return cache.get(path);
    const exports={};cache.set(path,exports);
    vm.runInNewContext(sucrase.transform(fs.readFileSync(path,'utf8'),{transforms:['imports','jsx']}).code,
      {exports,require,console,AbortController,setTimeout:(fn,ms)=>{if(fakeTimers){const id=++timerId;timers.set(id,{fn,ms});return id;}const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout:id=>fakeTimers?timers.delete(id):clearTimeout(id)});
    return exports;
  }
  const authModule=load('src/utils/AuthContext.js');
  const render=()=>{cursor=0;return authModule.AuthProvider({children:null}).props.value;};
  return {data,storage,regAPI,render,pauses,flushes,timers,tracking,async fireTimer(){const first=timers.entries().next().value;assert.ok(first,'expected retry timer');timers.delete(first[0]);first[1].fn();for(let i=0;i<20;i++)await tick();},async boot(){render();for(const effect of effects.splice(0))effect();for(let i=0;i<15;i++)await tick();return render();}};
}

test('register/me:401 явно отклоняет сессию, а503 остаётся временной ошибкой',async()=>{
  await assert.rejects(registrationMe(401).me(), error=>error.status===401 && error.code==='AUTH_REQUIRED');
  await assert.rejects(registrationMe(503).me(), error=>error.status!==401);
});
test('refreshLevel:401 открывает восстановление входа без удаления черновика и очереди',async()=>{
  const h=harness();await h.boot();
  const draft=h.data.get('ur_publication_draft_v1:cargo:A'), outbox=h.data.get('ur_chat_outbox');
  h.regAPI.me=async()=>{const e=Error('AUTH_REQUIRED');e.status=401;e.code='AUTH_REQUIRED';throw e;};
  await h.render().refreshLevel();
  const state=h.render();assert.equal(state.hasToken,false);assert.equal(state.session,null);assert.equal(state.recoveryRequired,true);
  assert.equal(h.data.get('ur_publication_draft_v1:cargo:A'),draft);
  assert.equal(h.data.get('ur_chat_outbox'),outbox);
  assert.equal(h.data.has('ur_reg_token'),false);
  assert.equal(h.data.has('ur_draft_registration'),false,'общий черновик должен быть сохранён отдельно от активного аккаунта');
  assert.ok([...h.data.values()].some(v=>v.includes('Сохранить')),'карантин содержит прежний черновик');
});
test('refreshLevel:сеть,таймаут,403,503 не выводят действующего пользователя',async()=>{
  for(const status of [0,403,503]){
    const h=harness();await h.boot();h.regAPI.me=async()=>{const e=Error('temporary');e.status=status;throw e;};
    await assert.rejects(h.render().refreshLevel());
    assert.equal(h.render().hasToken,true);assert.equal(h.render().session.user.id,'A');assert.equal(h.data.get('ur_reg_token'),'token-A');
  }
});
test('поздний401 прежнего запроса не отменяет новый вход',async()=>{
  const h=harness();await h.boot();let reject;
  h.regAPI.me=()=>new Promise((_,r)=>{reject=r;});const pending=h.render().refreshLevel();await tick();
  await h.storage.set('ur_reg_token','token-B');reject(Object.assign(Error('AUTH_REQUIRED'),{status:401,code:'AUTH_REQUIRED'}));
  await pending;assert.equal(h.data.get('ur_reg_token'),'token-B');assert.equal(h.render().hasToken,true);
});

test('карантин переживает перезапуск и допускает только подтверждённого прежнего владельца в том жеAPI',async()=>{
  const h=harness();const recovery={apiBase:origin,ownerId:'A'};
  await saveSessionRecovery(recovery,h.storage);
  const restarted=harness(h.data);const state=await restarted.boot();
  assert.equal(state.loading,false);assert.equal(state.hasToken,false);assert.equal(state.session,null);
  assert.equal(restarted.data.has('ur_draft_registration'),false);
  await restoreSharedWork({apiBase:origin,ownerId:'B'},restarted.storage);
  assert.equal(restarted.data.has('ur_draft_registration'),false);
  await restoreSharedWork({apiBase:'https://qa2.urtruck.kz/api/v1',ownerId:'A'},restarted.storage);
  assert.equal(restarted.data.has('ur_draft_registration'),false);
  await restoreSharedWork(recovery,restarted.storage);
  assert.equal(restarted.data.get('ur_draft_registration'),'{"name":"Сохранить"}');
  await restarted.storage.remove('ur_draft_registration');
  await restoreSharedWork(recovery,restarted.storage);
  assert.equal(restarted.data.has('ur_draft_registration'),false,'повторное обновление профиля не воскрешает очищенную форму');
});
test('ошибка backup не допускает нового владельца; повтор после перезапуска сохраняет работу',async()=>{
  const h=harness();await h.boot();const set=h.storage.set;
  h.storage.set=async(k,v)=>{if(k.startsWith('ur_session_recovery_v1:'))throw Error('storage');return set(k,v);};
  h.regAPI.me=async()=>{throw Object.assign(Error('AUTH_REQUIRED'),{status:401,code:'AUTH_REQUIRED'});};
  await assert.rejects(h.render().refreshLevel(),/storage/);
  assert.equal(h.data.get('ur_draft_registration'),'{"name":"Сохранить"}');
  await assert.rejects(h.render().signIn('b',1,'token-B',{userId:'B'}),/storage/);
  assert.equal(h.data.get('ur_reg_token'),'token-A');
  const restarted=harness(h.data);await restarted.boot();
  restarted.regAPI.me=async()=>({id:'B',role:'client',verification_level:1});
  await restarted.render().signIn('b',1,'token-B',{userId:'B'});
  assert.equal(restarted.data.has('ur_draft_registration'),false);
  assert.ok([...restarted.data.values()].some(v=>v.includes('Сохранить')));
});
test('неудалённый recovery-маркер блокирует успешный новый вход',async()=>{
  const h=harness();await saveSessionRecovery({apiBase:origin,ownerId:'A'},h.storage);await h.boot();
  const remove=h.storage.remove;h.storage.remove=async k=>{if(k!=='ur_session_recovery_required')return remove(k);};
  await assert.rejects(h.render().signIn('b',1,'token-B',{userId:'B'}),/SESSION_RECOVERY_CLEAR_FAILED/);
  assert.equal(h.render().hasToken,false);assert.equal(h.render().session,null);
});
test('повреждённый recoveryJSON сохраняется и не оставляет бесконечную загрузку',async()=>{
  const h=harness();h.data.set('ur_session_recovery_required','{broken');
  const state=await h.boot();assert.equal(state.loading,false);assert.equal(state.hasToken,false);
  assert.equal(h.data.get('ur_session_recovery_corrupt_v1'),'{broken');
});
test('выходB сохраняет черновикчатаA и legacy без доказанного окружения',async()=>{
  const h=harness();const a='ur_draft_chat_'+JSON.stringify([origin,'A','room']);const b='ur_draft_chat_'+JSON.stringify([origin,'B','room']);
  h.data.set(a,'"секретA"');h.data.set(b,'"B"');h.data.set('ur_draft_chat_'+JSON.stringify(['A','room']),'"legacyA"');
  await clearSharedAndOwnedDrafts({apiBase:origin,ownerId:'B'},h.storage);
  assert.equal(h.data.get(a),'"секретA"');assert.equal(h.data.has(b),false);
  assert.ok([...h.data.values()].includes('"legacyA"'));
});
test('401 не удаляет сообщение и не расходует лимит попыток; logoutB не удаляет очередьA',async()=>{
  pauseOutbox(false);await clearOutbox();await enqueueOutbox({clientId:'keep-A',payload:{text:'A'}},'A');
  for(let i=0;i<8;i++)await flushOutbox(async()=>{throw Object.assign(Error('AUTH_REQUIRED'),{status:401});},'A');
  await clearOutboxForUser('B');assert.equal(await outboxCount(),1);
  const item=JSON.parse(await realStorage.get('ur_chat_outbox'))[0];assert.equal(item.attempts,undefined);
});
test('ожидающий flushA не отправляет хвост после pause→входB→resume',async()=>{
  pauseOutbox(false);await clearOutbox();for(const id of ['first','tail'])await enqueueOutbox({clientId:id,payload:{id}},'A');
  let finish;let active='A';const sent=[];
  const pending=flushOutbox(async p=>{sent.push({active,id:p.id});await new Promise(r=>{finish=r;});},'A');
  while(!finish)await tick();pauseOutbox(true);active='B';pauseOutbox(false);finish();await pending;
  assert.deepEqual(sent,[{active:'A',id:'first'}]);assert.equal(await outboxCount(),2);
});
test('карантин50сообщенийA не блокирует очередьB и одинаковыйclientId не удаляет чужую запись',async()=>{
  pauseOutbox(false);await clearOutbox();
  for(let i=0;i<50;i++)await enqueueOutbox({clientId:String(i),payload:{id:i}},'A');
  await enqueueOutbox({clientId:'0',payload:{id:'B'}},'B');
  const sent=[];await flushOutbox(async p=>sent.push(p.id),'B');
  assert.deepEqual(sent,['B']);assert.equal(await outboxCount(),50);
});
test('queued flushA сохраняет generation постановки и не стартует после входаB',async()=>{
  pauseOutbox(false);await clearOutbox();await enqueueOutbox({clientId:'A',payload:{id:'secret'}},'A');
  let finish;let active='A';const sent=[];
  const first=flushOutbox(async p=>{sent.push({active,id:p.id});await new Promise(r=>{finish=r;});},'A');
  while(!finish)await tick();
  const queued=flushOutbox(async p=>sent.push({active,id:p.id}),'A');
  pauseOutbox(true);active='B';pauseOutbox(false);finish();await Promise.all([first,queued]);
  assert.deepEqual(sent,[{active:'A',id:'secret'}]);assert.equal(await outboxCount(),1);
});
test('chatAPI не отправляет сообщение после смены аккаунта во время чтения bearer',async()=>{
  const source=fs.readFileSync('src/utils/chatAPI.js','utf8');const method=source.slice(source.indexOf('  async send('),source.indexOf('  async rooms('));
  let finish;let current=true;let requests=0;
  const api=vm.runInNewContext('({'+method+'})',{BASE:origin+'/chat',headers:()=>new Promise(r=>{finish=r;}),getLanguage:()=> 'RU',authedFetch:async()=>{requests++;return{ok:true,json:async()=>({ok:true})};}});
  const pending=api.send({text:'СекретA'},{isCurrent:()=>current});current=false;finish({Authorization:'Bearer B'});
  await assert.rejects(pending,error=>error.isNetwork===true);assert.equal(requests,0);
});
test('настоящий register/me:таймаут ограничен и не удаляет bearer',async()=>{
  const fetch=globalThis.fetch,timer=globalThis.setTimeout;
  await realStorage.set('ur_reg_token','synthetic-timeout');
  globalThis.fetch=async()=>new Promise(()=>{});
  globalThis.setTimeout=(fn,ms,...args)=>timer(fn,ms===15000?1:ms,...args);
  try {await assert.rejects(realRegAPI.me(),/ACCOUNT_FETCH_TIMEOUT/);assert.equal(await realStorage.get('ur_reg_token'),'synthetic-timeout');}
  finally{globalThis.fetch=fetch;globalThis.setTimeout=timer;}
});
test('bootstrap мигрирует свой legacy-черновик только после200 того же bearer',async()=>{
  const h=harness();
  h.data.set('ur_publication_draft_v1:trip%3Aunbound:A','{"price":"4500"}');
  h.data.set('ur_publication_draft_v1:trip%3Avehicle-1:A','{"price":"5500"}');
  await h.boot();
  const key='ur_publication_draft_v1:'+encodeURIComponent(origin)+':cargo:A';
  assert.equal(h.data.get(key),h.data.get('ur_publication_draft_v1:cargo:A'));
  for(const kind of ['trip%3Aunbound','trip%3Avehicle-1'])assert.equal(h.data.get('ur_publication_draft_v1:'+encodeURIComponent(origin)+':'+kind+':A'),h.data.get('ur_publication_draft_v1:'+kind+':A'));
  for(const mode of ['qa2','rejected','other-owner']){
    const x=harness();if(mode==='qa2')x.data.set('ur_session',JSON.stringify({apiBase:'https://qa2.urtruck.kz/api/v1',user:{id:'A',role:'client'}}));
    if(mode==='rejected')x.regAPI.me=async()=>{throw Object.assign(Error('AUTH_REQUIRED'),{status:401,code:'AUTH_REQUIRED'});};
    if(mode==='other-owner')x.regAPI.me=async()=>({id:'B',role:'client',verification_level:1});
    await x.boot();assert.equal(x.data.has(key),false,mode);assert.ok(x.data.has('ur_publication_draft_v1:cargo:A'));
  }
});


test('signIn: transient 503 retries verification and resumes the same owner outbox', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot();
  h.flushes.length=0; h.pauses.length=0; let attempts=0;
  h.regAPI.me=async()=>{attempts++;if(attempts===1)throw Object.assign(Error('temporary'),{status:503});return {id:'A',role:'client',verification_level:1};};
  await h.render().signIn('phone',1,'token-A',{userId:'A'});
  for(let i=0;i<20;i++)await tick();
  assert.equal(attempts,1); assert.equal(h.pauses.at(-1),true); assert.deepEqual(h.flushes,[]);
  const retry=[...h.timers.entries()].find(([,timer])=>timer.ms===5000);
  assert.ok(retry,'transient failure must schedule automatic retry');
  h.timers.delete(retry[0]); retry[1].fn(); for(let i=0;i<30;i++)await tick();
  assert.equal(attempts,2); assert.equal(h.pauses.at(-1),false); assert.deepEqual(h.flushes,['A']);
});


test('stale retry after account switch cannot verify or flush the old owner', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0; let attempts=0;
  h.regAPI.me=async()=>{attempts++;throw Object.assign(Error('temporary'),{status:503});};
  await h.render().signIn('a',1,'token-A',{userId:'A'}); for(let i=0;i<20;i++)await tick();
  const oldRetry=[...h.timers.values()].find(timer=>timer.ms===5000); assert.ok(oldRetry);
  h.regAPI.me=async()=>{attempts++;return {id:'B',role:'client',verification_level:1};};
  await h.render().signIn('b',1,'token-B',{userId:'B'}); for(let i=0;i<30;i++)await tick();
  const before=attempts; oldRetry.fn(); for(let i=0;i<20;i++)await tick();
  assert.equal(attempts,before); assert.deepEqual(h.flushes,['B']);
});

test('role change while verification is pending restarts retry for the same owner', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0; let attempts=0;
  h.regAPI.me=async()=>{attempts++;if(attempts<3)throw Object.assign(Error('temporary'),{status:503});return {id:'A',role:'driver',verification_level:1};};
  await h.render().signIn('a',1,'token-A',{userId:'A'}); for(let i=0;i<20;i++)await tick();
  await h.render().setRole('driver'); for(let i=0;i<20;i++)await tick();
  assert.equal(attempts,2);
  const retry=[...h.timers.entries()].find(([,timer])=>timer.ms===5000); assert.ok(retry);
  h.timers.delete(retry[0]); retry[1].fn(); for(let i=0;i<30;i++)await tick();
  assert.equal(attempts,3); assert.deepEqual(h.flushes,['A']);
});

test('устаревший /me не теряет повторную проверку роли, пока запись сессии ожидает storage', async () => {
  const h=harness(null,{fakeTimers:true}); h.flushes.length=0;
  let attempts=0, resolveFirst;
  h.regAPI.me=()=>{
    attempts++;
    if(attempts===1)return new Promise(resolve=>{resolveFirst=resolve;});
    return Promise.resolve({id:'A',role:'driver',verification_level:1});
  };
  await h.boot();
  for(let i=0;i<20&&!resolveFirst;i++)await tick();
  assert.equal(attempts,1,'boot starts the original in-flight /me request');

  const originalSet=h.storage.set; let releaseRoleWrite;
  h.storage.set=async(k,v)=>{
    if(k==='ur_session')await new Promise(resolve=>{releaseRoleWrite=()=>originalSet(k,v).then(resolve);});
    else await originalSet(k,v);
  };
  const roleChange=h.render().setRole('driver');
  for(let i=0;i<10&&!releaseRoleWrite;i++)await tick();
  assert.equal(typeof releaseRoleWrite,'function','role session write is deliberately held');

  resolveFirst({id:'A',role:'client',verification_level:1});
  for(let i=0;i<20;i++)await tick();
  assert.deepEqual(h.flushes,[],'stale verification must not resume the outbox');

  const release=releaseRoleWrite;
  releaseRoleWrite=null;
  // Release only the held setRole write; the subsequent session write, if any,
  // uses the original storage implementation.
  h.storage.set=originalSet;
  release();
  await roleChange;
  for(let i=0;i<30;i++)await tick();

  assert.equal(attempts,2,'setRole restarts verification for the current generation');
  assert.equal(h.render().session.user.role,'driver');
  assert.equal(h.pauses.at(-1),false);
  assert.deepEqual(h.flushes,['A']);
});

test('confirmed 401 does not retry or resume queued messages', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0; let attempts=0;
  h.regAPI.me=async()=>{attempts++;throw Object.assign(Error('AUTH_REQUIRED'),{status:401,code:'AUTH_REQUIRED'});};
  await h.render().signIn('a',1,'token-A',{userId:'A'}); for(let i=0;i<30;i++)await tick();
  assert.equal(attempts,1); assert.equal(h.render().recoveryRequired,true); assert.deepEqual(h.flushes,[]);
  assert.equal([...h.timers.values()].some(timer=>timer.ms===5000),false);
});


test('temporary failure followed by 401 keeps outbox paused and stops retrying', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0; h.pauses.length=0; let attempts=0;
  h.regAPI.me=async()=>{attempts++;if(attempts===1)throw Object.assign(Error('temporary'),{status:503});throw Object.assign(Error('AUTH_REQUIRED'),{status:401,code:'AUTH_REQUIRED'});};
  await h.render().signIn('a',1,'token-A',{userId:'A'}); for(let i=0;i<20;i++)await tick();
  const retry=[...h.timers.entries()].find(([,timer])=>timer.ms===5000); assert.ok(retry);
  h.timers.delete(retry[0]);retry[1].fn();for(let i=0;i<30;i++)await tick();
  assert.equal(attempts,2);assert.equal(h.render().recoveryRequired,true);assert.equal(h.pauses.at(-1),true);assert.deepEqual(h.flushes,[]);
  assert.equal([...h.timers.values()].some(timer=>timer.ms===15000 || timer.ms===60000),false);
});


test('register/me times out if response body hangs after headers', async () => {
  await realStorage.set('ur_reg_token','synthetic-body-timeout');
  const fetch = globalThis.fetch, timer = globalThis.setTimeout;
  globalThis.fetch=async()=>({status:200,ok:true,json:()=>new Promise(()=>{})});
  globalThis.setTimeout=(fn,ms,...args)=>timer(fn,ms===15000?5:ms,...args);
  try { await assert.rejects(Promise.race([realRegAPI.me(),new Promise((_,reject)=>timer(()=>reject(Error('BODY_HUNG')),100))]),/ACCOUNT_FETCH_TIMEOUT/); assert.equal(await realStorage.get('ur_reg_token'),'synthetic-body-timeout'); }
  finally { globalThis.fetch=fetch; globalThis.setTimeout=timer; }
});

test('failed logout restores pending auth verification for the same owner', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0; let calls=0;
  h.regAPI.me=async()=>{calls++;if(calls===1)throw Object.assign(Error('temporary'),{status:503});return {id:'A',role:'client',verification_level:1};};
  await h.render().signIn('a',1,'token-A',{userId:'A'});for(let i=0;i<20;i++)await tick();
  assert.equal(calls,1); assert.ok([...h.timers.values()].some(t=>t.ms===5000));
  h.tracking.stop=async()=>({ok:false,reason:'STOP_FAILED'});
  const result=await h.render().signOut();for(let i=0;i<30;i++)await tick();
  assert.equal(result.ok,false);assert.equal(h.data.get('ur_reg_token'),'token-A');
  assert.equal(calls,2);assert.deepEqual(h.flushes,['A']);assert.equal(h.pauses.at(-1),false);
});


test('logout durable revoke failure resumes pending verification without clearing token', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0; let calls=0;
  h.regAPI.me=async()=>{calls++;if(calls===1)throw Error('temporary');return {id:'A',role:'client',verification_level:1};};
  h.regAPI.stageLogoutRevoke=async()=>{throw Error('storage failed');};
  await h.render().signIn('a',1,'token-A',{userId:'A'});for(let i=0;i<20;i++)await tick();
  const result=await h.render().signOut();for(let i=0;i<30;i++)await tick();
  assert.equal(result.reason,'PENDING_LOGOUT_REVOKE_NOT_DURABLE');assert.equal(h.data.get('ur_reg_token'),'token-A');
  assert.equal(calls,2);assert.deepEqual(h.flushes,['A']);
});

test('failed logout never retries verification after token changes', async () => {
  const h=harness(null,{fakeTimers:true}); await h.boot(); h.flushes.length=0;let calls=0;
  h.regAPI.me=async()=>{calls++;throw Error('temporary');};
  await h.render().signIn('a',1,'token-A',{userId:'A'});for(let i=0;i<20;i++)await tick();
  h.tracking.stop=async()=>{await h.storage.set('ur_reg_token','token-B');return {ok:false};};
  await h.render().signOut();for(let i=0;i<20;i++)await tick();
  assert.equal(calls,1);assert.deepEqual(h.flushes,[]);assert.equal(h.data.get('ur_reg_token'),'token-B');
});

test('неполная сохранённая сессия при ошибке сети ожидает восстановления, не предлагает новый вход', async () => {
  const data = new Map([['ur_reg_token', 'token-A']]);
  const h = harness(data, { fakeTimers: true });
  h.regAPI.me = async () => { throw Error('offline'); };
  await h.boot();
  assert.equal(h.render().restoringSession, 'error');
  assert.equal(data.get('ur_reg_token'), 'token-A');
  h.regAPI.me = async () => ({ id: 'A', role: 'client', verification_level: 1 });
  await h.render().retrySessionRestore();
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(h.render().restoringSession, null);
  assert.equal(h.render().session.user.id, 'A');
  assert.equal(data.get('ur_reg_token'), 'token-A');
});


test('optional profile body timeout completes verified login and resumes the same owner outbox', async () => {
  const h = harness(); await h.boot(); h.flushes.length = 0; h.pauses.length = 0;
  await realStorage.set('ur_reg_token', 'token-A');
  const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
  globalThis.fetch = async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) });
  globalThis.setTimeout = (fn, ms, ...args) => originalTimer(fn, ms === 15000 ? 5 : ms, ...args);
  h.regAPI.profile = () => realRegAPI.profile();
  try {
    await h.render().signIn('a', 1, 'token-A', { userId: 'A' });
    await new Promise(resolve => originalTimer(resolve, 30));
    for (let i = 0; i < 15; i++) await tick();
    assert.equal(h.render().session.user.id, 'A');
    assert.equal(h.render().hasToken, true);
    assert.equal(h.pauses.at(-1), false);
    assert.deepEqual(h.flushes, ['A']);
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; }
});

test('late optional profile result cannot resume outbox for a replaced token', async () => {
  const h = harness(); await h.boot(); h.flushes.length = 0; h.pauses.length = 0;
  let release;
  h.regAPI.profile = () => new Promise(resolve => { release = resolve; });
  await h.render().signIn('a', 1, 'token-A', { userId: 'A' });
  for (let i = 0; i < 15; i++) await tick();
  assert.equal(typeof release, 'function');
  await h.storage.set('ur_reg_token', 'token-B');
  release({ name: 'Previous owner' });
  for (let i = 0; i < 15; i++) await tick();
  assert.equal(h.data.get('ur_reg_token'), 'token-B');
  assert.equal(h.pauses.at(-1), true);
  assert.deepEqual(h.flushes, []);
});
