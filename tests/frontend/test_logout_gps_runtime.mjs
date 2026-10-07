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
  const api=vm.runInNewContext(code+'\n({pushLocationToDeals,startBackgroundTracking,stopBackgroundTrackingForLogout})',scope);
  return {api,data,calls,native};
}

test('logout stops persisted native GPS and removes the last sample',async()=>{
  const h=harness(); h.data.set('ur_reg_token','A'); h.data.set('ur_bg_last_location_v1','old');
  await h.api.stopBackgroundTrackingForLogout('A');
  assert.deepEqual(h.calls,['stop','remove:ur_bg_last_location_v1']);
  assert.equal(h.data.has('ur_bg_last_location_v1'),false);
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
