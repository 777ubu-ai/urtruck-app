import { confirmPublicationSession } from '../../src/utils/publicationSession.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseWeightTonsInput } from '../../src/utils/normalizers.js';
const publicationEnv = () => ({confirmPublicationSession, draft:{save:async()=>{},clear:async()=>{}},
 ownerRef:{current:'test-user'},sessionRef:{current:{user:{id:'test-user',role:'client'}}},mountedRef:{current:true},refreshLevel:async()=>{},
 regAPI:{getToken:async()=>'test-bearer',publicationAccount:async()=>({id:'test-user',role:'client'})}});
const src=fs.readFileSync('src/screens/CreateCargoScreen.js','utf8');
const start=src.indexOf('  const submit = async () => {');
const end=src.indexOf('\n  };',start)+5;
const actual=src.slice(start,end)+'\nsubmit';
function setup(photos,upload) {
 const calls=[],uploadedPhotos={current:new Map()}, submissionInFlight={current:false};
 const ctx={...publicationEnv(),from:'Алматы',to:'Астана',cargoDesc:'Груз',tons:'1',m3:'0',price:'1000',pickupDate:'2099-01-01',parseWeightTonsInput,
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

test('cargo submission preserves decimal comma in the tonnes payload', async () => {
 const h=setup([],()=>{throw Error('not called');});
 h.submit=vm.runInNewContext(actual, {...publicationEnv(),
  from:'Алматы',to:'Астана',cargoDesc:'Груз',tons:'20,5',m3:'0',price:'1000',pickupDate:'2099-01-01',
  fromPoint:null,toPoint:null,truckType:'tent',currency:'USD',paymentType:null,photos:[],submitting:false,
  uploadedPhotos:{current:new Map()},submissionInFlight:{current:false},parseWeightTonsInput,
  setErrors:()=>{},setSubmitting:()=>{},t:x=>x,toast:()=>{},normalizeDateInput:x=>x,addCustomCargoType:()=>{},cleanPlaceName:x=>x,role:'client',
  navigation:{reset:()=>{}},marketAPI:{uploadCargoPhoto:async()=>{},createCargo:async payload=>{h.calls.push(['create',payload]);return {ok:true,id:'cargo-decimal'};}}
 });
 await h.submit();
 const created=h.calls.find(x=>x[0]==='create');
 assert.equal(created[1].weight_tons,20.5);
});

test('second tap while uploading cannot create a second cargo',async()=>{
 let finish;const pending=new Promise(r=>{finish=r}); const h=setup(['photo'],()=>pending);
 const first=h.submit(); await h.submit(); finish({photo_key:'key'}); await first;
 assert.equal(h.calls.filter(x=>x[0]==='create').length,1);
});
