import test from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../../src/utils/storage.js';
import { marketAPI } from '../../src/utils/marketAPI.js';
import { confirmPublicationSession, sessionRole } from '../../src/utils/publicationSession.js';
import { Platform } from 'react-native';

test('роль аккаунта превосходит stale route и нормализует shipper',()=>{
 assert.equal(sessionRole({user:{role:'driver'}},'client'),'driver');
 assert.equal(sessionRole({user:{role:'shipper'}},'driver'),'client');
 assert.equal(sessionRole({user:{role:'guest'}},'client'),null);
});

test('смена bearer перед create блокируется без запроса',async()=>{
 const original=global.fetch;let sent=0;global.fetch=async()=>{sent++;return {ok:true,json:async()=>({id:'new'})};};
 try{
  await storage.set('ur_reg_token','account-b');
  for(const fn of [marketAPI.createCargo,marketAPI.createTrip])await assert.rejects(fn({}, {expectedToken:'account-a',isCurrent:()=>true}),{code:'PUBLICATION_SESSION_CHANGED'});
  assert.equal(sent,0);
 }finally{global.fetch=original;await storage.remove('ur_reg_token');}
});

test('смена аккаунта при подготовке фотографии не отправляет multipart новым bearer',async()=>{
 const original=global.fetch;const os=Platform.OS;Platform.OS='web';let finish;let uploads=0;
 global.fetch=async url=>{if(url==='blob:test')return {blob:()=>new Promise(r=>{finish=r;})};uploads++;return {ok:true,json:async()=>({photo_key:'wrong'})};};
 try{
  await storage.set('ur_reg_token','account-a');
  const pending=marketAPI.uploadCargoPhoto('blob:test',{expectedToken:'account-a',isCurrent:()=>true});
  await new Promise(r=>setImmediate(r));await storage.set('ur_reg_token','account-b');finish(new Blob(['test'],{type:'image/jpeg'}));
  await assert.rejects(pending,{code:'PUBLICATION_SESSION_CHANGED'});assert.equal(uploads,0);
 }finally{Platform.OS=os;global.fetch=original;await storage.remove('ur_reg_token');}
});

test('серверный аккаунт другой роли или другого ID не проходит preflight',async()=>{
 for(const account of [{id:'a',role:'driver'},{id:'b',role:'client'},null]){
  await assert.rejects(confirmPublicationSession({expectedRole:'client',expectedUserId:'a',getSession:()=>({user:{id:'a',role:'client'}}),readToken:async()=>'a-token',readAccount:async()=>account}));
 }
});
