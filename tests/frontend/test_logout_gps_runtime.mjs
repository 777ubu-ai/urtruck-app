import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bgSource = fs.readFileSync('src/utils/backgroundLocation.js', 'utf8');
function harness() {
  const data = new Map();
  const calls = [];
  let started = true;
  const native = {
    Accuracy: { Balanced: 1 },
    hasStartedLocationUpdatesAsync: async () => started,
    stopLocationUpdatesAsync: async () => { calls.push('stop'); started = false; },
    startLocationUpdatesAsync: async () => { calls.push('start'); started = true; },
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
  };
  const storage = {
    get: async k => data.get(k) ?? null,
    set: async (k,v) => { calls.push('write:'+k); data.set(k,v); },
    remove: async k => { calls.push('remove:'+k); data.delete(k); },
  };
  const queue = { migrate: async()=>{}, append: async()=>{}, drain: async()=>{} };
  const scope = { Platform: {OS:'android'}, storage, durableStorage:storage,
    createLocationQueue:()=>queue, locationSampleId:()=> 'sample', API_BASE:'http://127.0.0.1',
    t:x=>x, console, setTimeout,clearTimeout,AbortController, fetch: async()=>({ok:true,json:async()=>({ok:true,deal_ids:[]})}),
    require: name => name==='expo-task-manager' ? {defineTask:()=>{}} : native };
  const code=bgSource.replace(/^import .*;\s*$/gm,'').replace(/^export .* from .*;\s*$/gm,'').replace(/^export /gm,'');
  const api=vm.runInNewContext(code+'\n({pushLocationToDeals,startBackgroundTracking,stopBackgroundTrackingForLogout,restoreBackgroundTrackingForLogoutFailure,clearBackgroundLocationSampleForLogout})',scope);
  return {api,data,calls,native,isStarted:()=>started,setStarted:value=>{started=value;}};
}

test('logout stop preserves the last sample until durable revoke succeeds',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  const result=await h.api.stopBackgroundTrackingForLogout('A');
  assert.equal(result.ok,true);
  assert.deepEqual(h.calls,['stop']);
  assert.equal(h.data.get('ur_bg_last_location_v1'),'old');
});

test('durable logout staging failure restores GPS without clearing session or sample',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  const stopped=await h.api.stopBackgroundTrackingForLogout('A');
  const restored=await h.api.restoreBackgroundTrackingForLogoutFailure('A',stopped.stopped);
  assert.equal(restored.ok,true);
  assert.equal(restored.restored,true);
  assert.equal(h.data.get('ur_reg_token'),'A');
  assert.equal(h.data.get('ur_bg_last_location_v1'),'old');
  assert.equal(h.isStarted(),true);
  assert.deepEqual(h.calls,['stop','start']);
});

test('sample cache is removed only after durable logout staging',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  const result=await h.api.clearBackgroundLocationSampleForLogout('A');
  assert.equal(result.ok,true);
  assert.equal(h.data.has('ur_bg_last_location_v1'),false);
});

test('native stop failure is returned and last sample is preserved',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  h.native.stopLocationUpdatesAsync=async()=>{h.calls.push('stop');throw Error('native_stop_failed');};
  const result=await h.api.stopBackgroundTrackingForLogout('A');
  assert.equal(result.ok,false);
  assert.equal(result.reason,'native_stop_failed');
  assert.deepEqual(h.calls,['stop']);
  assert.equal(h.data.get('ur_bg_last_location_v1'),'old');
});

test('native stop rejection after a real stop restores GPS even before logout timeout',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  h.native.stopLocationUpdatesAsync=async()=>{h.calls.push('stop');h.setStarted(false);throw Error('late_native_error');};
  const result=await h.api.stopBackgroundTrackingForLogout('A');
  assert.equal(result.ok,false);
  assert.equal(result.reason,'stop_failed_tracking_restored');
  assert.equal(h.isStarted(),true);
  assert.equal(h.data.get('ur_reg_token'),'A');
  assert.equal(h.data.get('ur_bg_last_location_v1'),'old');
  assert.deepEqual(h.calls,['stop','start']);
});

test('native status-query failure is not treated as already stopped',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  h.native.hasStartedLocationUpdatesAsync=async()=>{throw Error('native_status_failed');};
  const result=await h.api.stopBackgroundTrackingForLogout('A');
  assert.equal(result.ok,false);
  assert.equal(result.reason,'native_status_failed');
  assert.equal(h.calls.includes('remove:ur_bg_last_location_v1'),false);
});

test('logout timeout aborts late cleanup and restores GPS for the retained session',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  const controller=new AbortController(); let release;
  const nativeStop=new Promise(resolve=>{release=resolve;});
  h.native.stopLocationUpdatesAsync=async()=>{h.calls.push('stop-start'); await nativeStop; h.setStarted(false); h.calls.push('stop-finished');};
  const pending=h.api.stopBackgroundTrackingForLogout('A',{signal:controller.signal});
  await new Promise(resolve=>setTimeout(resolve,0));
  controller.abort(); release();
  const result=await pending;
  assert.equal(result.ok,false);
  assert.equal(result.reason,'logout_timeout_tracking_restored');
  assert.equal(h.data.get('ur_reg_token'),'A');
  assert.equal(h.data.get('ur_bg_last_location_v1'),'old');
  assert.equal(h.isStarted(),true);
  assert.deepEqual(h.calls,['stop-start','stop-finished','start']);
});

test('logout timeout restores GPS when a late native rejection follows an actual stop',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  const controller=new AbortController(); let release;
  const nativeStop=new Promise(resolve=>{release=resolve;});
  h.native.stopLocationUpdatesAsync=async()=>{
    h.calls.push('stop-start'); h.setStarted(false); await nativeStop; throw Error('late_native_error');
  };
  const pending=h.api.stopBackgroundTrackingForLogout('A',{signal:controller.signal});
  await new Promise(resolve=>setTimeout(resolve,0));
  controller.abort(); release();
  const result=await pending;
  assert.equal(result.ok,false);
  assert.equal(result.reason,'logout_timeout_tracking_restored');
  assert.equal(h.data.get('ur_reg_token'),'A');
  assert.equal(h.isStarted(),true);
  assert.deepEqual(h.calls,['stop-start','start']);
});

test('old logout cannot stop or clear the new account tracker',async()=>{
  const h=harness(); h.data.set('ur_reg_token','B'); h.data.set('ur_bg_last_location_v1','B-point');
  await h.api.stopBackgroundTrackingForLogout('A');
  assert.deepEqual(h.calls,[]); assert.equal(h.data.get('ur_bg_last_location_v1'),'B-point');
});

test('signed-out callback never saves coordinates',async()=>{
  const h=harness();
  await h.api.pushLocationToDeals({latitude:43,longitude:76,timestamp:Date.now()});
  assert.deepEqual(h.calls,[]);
});

test('queued sample from before logout is fenced out',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_session',JSON.stringify({user:{id:'A'}}));
  const old=h.api.pushLocationToDeals({latitude:43,longitude:76,timestamp:Date.now()},['deal-A']);
  const stopped=h.api.stopBackgroundTrackingForLogout('A');
  h.data.delete('ur_reg_token'); await Promise.all([old,stopped]);
  assert.equal(h.calls.some(x=>x.startsWith('write:')),false);
});

test('new start waits for an old native stop to finish',async()=>{
  const h=harness(); let release; const pending=new Promise(r=>{release=r});
  h.data.set('ur_reg_token','A');
  h.native.stopLocationUpdatesAsync=async()=>{h.calls.push('stop-start'); await pending; h.calls.push('stop-finished');};
  const old=h.api.stopBackgroundTrackingForLogout('A');
  await new Promise(r=>setTimeout(r,0));
  h.data.set('ur_reg_token','B'); const fresh=h.api.startBackgroundTracking();
  release(); await Promise.all([old,fresh]);
  assert.ok(h.calls.indexOf('stop-finished') < h.calls.indexOf('start'));
  assert.equal(h.calls.includes('remove:ur_bg_last_location_v1'),false);
});

const profile=fs.readFileSync('src/screens/ProfileScreen.js','utf8');
const auth=fs.readFileSync('src/utils/AuthContext.js','utf8');
const authMutationSource=auth.slice(auth.indexOf('let authMutationChain'),auth.indexOf('const withTimeout'));
const authMutationApi=vm.runInNewContext(authMutationSource+'\n({runAuthMutation,commitGuestToken})',{});
const ownerGuardSource=auth.slice(auth.indexOf('async function authOwnerIsCurrent'),auth.indexOf('const withTimeout'));
const ownerGuardApi=vm.runInNewContext(ownerGuardSource+'\n({authOwnerIsCurrent})',{});
test('new sign-in waits for an in-flight logout staging decision',async()=>{
  const state={token:'A',session:'A'}; let releaseStage;
  const stage=new Promise(resolve=>{releaseStage=resolve;});
  const logout=authMutationApi.runAuthMutation(async()=>{
    await stage;
    if(state.token!=='A') return {ok:false,reason:'SESSION_CHANGED'};
    state.session=null; state.token=null;
    return {ok:true};
  });
  const signIn=authMutationApi.runAuthMutation(async()=>{state.token='B';state.session='B';});
  releaseStage();
  await Promise.all([logout,signIn]);
  assert.deepEqual(state,{token:'B',session:'B'});
});
test('late guest response cannot overwrite a newer account token',async()=>{
  let generation=0; let token=null; let session='none'; const writes=[]; let releaseGuest;
  const guestResponse=new Promise(resolve=>{releaseGuest=resolve;});
  const guest=guestResponse.then(data=>authMutationApi.commitGuestToken(
    data,0,()=>generation,async()=>token,async value=>{token=value;writes.push(value);},()=>{session='guest';},
  ));
  await authMutationApi.runAuthMutation(async()=>{
    generation+=1; token='account-A'; session='account-A'; writes.push(token);
  });
  releaseGuest({token:'guest-G',verification_level:0});
  const result=await guest;
  assert.equal(result.reason,'session_changed');
  assert.equal(token,'account-A');
  assert.equal(session,'account-A');
  assert.deepEqual(writes,['account-A']);
});
test('guest request started during logout cannot resurrect the revoked token',async()=>{
  let generation=0; let token='account-A'; let hasToken=true; let releaseStage; let started;
  const startedLogout=new Promise(resolve=>{started=resolve;});
  const stage=new Promise(resolve=>{releaseStage=resolve;});
  const logout=authMutationApi.runAuthMutation(async()=>{
    generation+=1; started(generation); await stage; token=null; hasToken=false; generation+=1;
  });
  const capturedGeneration=await startedLogout;
  const guest=authMutationApi.commitGuestToken(
    {token:'account-A'},capturedGeneration,()=>generation,async()=>token,
    async value=>{token=value;},()=>{hasToken=true;},
  );
  releaseStage(); await Promise.all([logout,guest]);
  assert.equal(token,null);
  assert.equal(hasToken,false);
});
test('late profile refresh cannot commit after logout and another account signs in',async()=>{
  let generation=1; let token='A'; let session={user:{id:'A'}}; let releaseRead;
  const readToken=new Promise(resolve=>{releaseRead=resolve;});
  const commit=ownerGuardApi.authOwnerIsCurrent('A',1,()=>generation,()=>readToken)
    .then(async current=>{
      if(current){session={user:{id:'A',name:'stale profile'}};}
    });
  generation=2; token='B'; session={user:{id:'B'}}; releaseRead('A');
  await commit;
  assert.equal(token,'B');
  assert.deepEqual(session,{user:{id:'B'}});
});
test('signOut checks bounded native stop before clearing session or bearer',()=>{
  const start=auth.indexOf('const signOut = () => runAuthMutation(async () => {');
  const end=auth.indexOf('const hasTokenRef',start);
  const handler=auth.slice(start,end);
  const check=handler.indexOf('if (!trackingResult?.ok)');
  assert.ok(check>=0);
  assert.ok(handler.indexOf('await withTimeout(\n      stopBackgroundTrackingForLogout(authToken, { signal: stopController.signal })')<check);
  assert.match(handler,/\(\) => stopController\.abort\(\)/);
  assert.ok(check<handler.indexOf('setSession(null)'));
  assert.ok(check<handler.indexOf('await regAPI.clearToken()'));
  assert.match(handler.slice(check,handler.indexOf('try {',check)),/return \{[\s\S]*ok: false/);
  assert.ok(handler.indexOf('restoreBackgroundTrackingForLogoutFailure(authToken, trackingResult.stopped)')<handler.indexOf("reason: 'PENDING_LOGOUT_REVOKE_NOT_DURABLE'"));
  assert.ok(handler.indexOf('await clearBackgroundLocationSampleForLogout(authToken)')<handler.indexOf('setSession(null)'));
  assert.match(handler,/const signOut = \(\) => runAuthMutation\(async \(\) => \{/);
  const signIn=auth.slice(auth.indexOf('const signIn ='),auth.indexOf('const setRole'));
  assert.match(signIn,/const signIn = \(phone, level = 1, token = null\) => runAuthMutation\(async \(\) => \{/);
  assert.ok(handler.indexOf("lastSampleCleanup?.reason === 'session_changed'")<handler.indexOf('setSession(null)'));
  const ensureGuest=auth.slice(auth.indexOf('const ensureGuest = useCallback'),auth.indexOf('const signIn ='));
  assert.match(ensureGuest,/regAPI\.ensureGuest\(\{ persist: false \}\)/);
  assert.match(ensureGuest,/commitGuestToken\(/);
});
const start=profile.indexOf("const ok = await askConfirm(t('logout_title')");
const handler=profile.slice(start,profile.indexOf('}} testID="profile-logout"',start));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const mode of ['failed-result','exception','success','cancel']) {
  test('logout button feedback: '+mode,async()=>{
    const alerts=[]; let calls=0;
    await new AsyncFunction('askConfirm','t','signOut','Alert',handler)(async()=>mode!=='cancel',x=>x,async()=>{
      calls++; if(mode==='exception') throw Error('storage'); return mode==='failed-result'?{ok:false}:undefined;
    },{alert:(...args)=>alerts.push(args)});
    assert.equal(alerts.length,['failed-result','exception'].includes(mode)?1:0);
    assert.equal(calls,mode==='cancel'?0:1);
  });
}
