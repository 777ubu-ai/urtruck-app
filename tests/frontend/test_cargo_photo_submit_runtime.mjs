import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('src/screens/CreateCargoScreen.js','utf8');
const start=src.indexOf('  const submit = async () => {');
const end=src.indexOf('\n  };',start)+5;
const actual=src.slice(start,end)+'\nsubmit';
function setup(photos,upload) {
 const calls=[],uploadedPhotos={current:new Map()}, submissionInFlight={current:false};
 const ctx={from:'Алматы',to:'Астана',cargoDesc:'Груз',tons:'1',m3:'0',price:'1000',pickupDate:'2099-01-01',
 fromPoint:null,toPoint:null,truckType:'tent',currency:'USD',paymentType:null,photos,submitting:false,uploadedPhotos,submissionInFlight,
 setErrors:()=>{},setSubmitting:x=>calls.push(['busy',x]),t:x=>x,toast:(...x)=>calls.push(['toast',...x]),
 normalizeDateInput:x=>x,addCustomCargoType:()=>{},cleanPlaceName:x=>x,role:'client',navigation:{reset:x=>calls.push(['nav',x])},
 marketAPI:{uploadCargoPhoto:async uri=>{calls.push(['upload',uri]); return upload(uri);},createCargo:async payload=>{calls.push(['create',payload]);return {ok:true,id:'new-cargo'};}}};
 return {submit:vm.runInNewContext(actual,ctx),calls,uploadedPhotos,submissionInFlight};
}

test('failed selected photo blocks publication and keeps uploaded keys for retry',async()=>{
 let fail=true;
 const h=setup(['first','second'],uri=>{if(uri==='second' && fail)throw Error('offline');return {photo_key:'key-'+uri};});
 await h.submit();
 assert.equal(h.calls.filter(x=>x[0]==='create').length,0);
 assert.ok(h.calls.some(x=>x[0]==='toast' && x[1]==='photo_failed'));
 assert.equal(h.submissionInFlight.current,false);
 fail=false; await h.submit();
 assert.equal(h.calls.filter(x=>x[0]==='upload' && x[1]==='first').length,1);
 const creates=h.calls.filter(x=>x[0]==='create'); assert.equal(creates.length,1);
 assert.deepEqual(Array.from(creates[0][1].photos),['key-first','key-second']);
});

test('empty upload response blocks publication instead of discarding the photo',async()=>{
 const h=setup(['photo'],()=>({})); await h.submit();
 assert.equal(h.calls.filter(x=>x[0]==='create').length,0);
 assert.ok(h.calls.some(x=>x[0]==='toast' && x[1]==='photo_failed'));
});

test('cargo with no photos still publishes once',async()=>{
 const h=setup([],()=>{throw Error('not called');});await h.submit();
 assert.equal(h.calls.filter(x=>x[0]==='upload').length,0);
 assert.equal(h.calls.filter(x=>x[0]==='create').length,1);
});

test('second tap while uploading cannot create a second cargo',async()=>{
 let finish;const pending=new Promise(r=>{finish=r}); const h=setup(['photo'],()=>pending);
 const first=h.submit(); await h.submit(); finish({photo_key:'key'}); await first;
 assert.equal(h.calls.filter(x=>x[0]==='create').length,1);
});
