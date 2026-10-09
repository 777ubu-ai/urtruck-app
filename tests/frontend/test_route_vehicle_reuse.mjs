import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const start = source.indexOf('  const onPublishRoute = async');
const end = source.indexOf('\n  const confirmAction', start);
function setup(list) {
  const calls = [], notices = [];
  const ctx = { vehicleAPI: { list }, role: 'driver', mounted: { current: true }, publishingRouteRef: { current: false },
    navigation: { navigate: (name, params) => calls.push({ name, params }) }, toast: msg => notices.push(msg), t: k => k };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.publish = onPublishRoute;', ctx);
  return { ctx, calls, notices };
}
test('empty successful garage opens route without another vehicle form', async () => {
  const h=setup(async()=>({ok:true,vehicles:[]})); await h.ctx.publish();
  assert.equal(h.calls[0].name,'CreateTrip'); assert.equal(h.calls[0].params.role,'driver');
});
test('existing single vehicle is reused with its exact id and data', async () => {
  const v={id:'existing-A',body_type:'curtain_sider',payload_tons:20,cargo_volume_m3:105};
  const h=setup(async()=>({ok:true,vehicles:[v]}));await h.ctx.publish();
  assert.equal(h.calls[0].name,'CreateTrip');assert.equal(h.calls[0].params.vehicleId,v.id);assert.equal(h.calls[0].params.vehicle,v);
});
test('multiple vehicles open selection instead of another registration', async () => {
  const h=setup(async()=>({ok:true,vehicles:[{id:'A'},{id:'B'}]}));await h.ctx.publish();
  assert.equal(h.calls[0].name,'VehicleChooser');assert.equal(h.calls[0].params.origin,'CreateTrip');
});
for(const result of [{ok:false,status:401,detail:'session_expired'},{ok:false,status:0,detail:'network_error'},{ok:true}]) {
 test(`failed/malformed list ${result.status??'malformed'} never means an empty garage`,async()=>{
  const h=setup(async()=>result);await h.ctx.publish();assert.equal(h.calls.length,0);assert.equal(h.notices.length,1);
 });
}
test('thrown network failure shows error and releases retry lock',async()=>{
 const h=setup(async()=>{throw Error('offline');});await h.ctx.publish();assert.equal(h.calls.length,0);assert.equal(h.notices.length,1);assert.equal(h.ctx.publishingRouteRef.current,false);
});
test('double tap during load creates only one route navigation',async()=>{
 let finish;let n=0;const h=setup(()=>{n++;return new Promise(r=>{finish=r;});});
 const first=h.ctx.publish();await h.ctx.publish();finish({ok:true,vehicles:[]});await first;assert.equal(n,1);assert.equal(h.calls.length,1);
});
test('response after unmount cannot navigate or display an error',async()=>{
 let finish;const h=setup(()=>new Promise(r=>{finish=r;}));const pending=h.ctx.publish();h.ctx.mounted.current=false;finish({ok:true,vehicles:[]});await pending;assert.equal(h.calls.length,0);assert.equal(h.notices.length,0);
});
