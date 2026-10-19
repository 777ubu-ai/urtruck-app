import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sucrase from 'sucrase';
import { durableStorage } from '../../src/utils/storage.js';
import * as drafts from '../../src/utils/publicationDraft.js';
const tick=()=>new Promise(r=>setImmediate(r));
let sequence=0;
const key=()=>drafts.publicationDraftKey('cargo','test-'+(++sequence));

// Реальный hook с управляемым React lifecycle, включая cleanup и async hydration.
function hookHarness(owner){
 const slots=[];let cursor=0;const pending=[];const values={description:'',price:''};
 const React={
  useState(initial){const i=cursor++;slots[i] ||= {value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
  useRef(initial){const i=cursor++;return slots[i] ||= {current:initial};},
  useEffect(fn,deps){const i=cursor++;const previous=slots[i];if(!previous||deps.some((v,j)=>v!==previous.deps[j])){slots[i]={deps,cleanup:previous?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
 };
 const exports={};vm.runInNewContext(sucrase.transform(fs.readFileSync('src/hooks/usePublicationDraft.js','utf8'),{transforms:['imports']}).code,{exports,require:name=>name==='react'?React:drafts,setTimeout,clearTimeout});
 function render(){cursor=0;const result=exports.usePublicationDraft('cargo',owner,{...values},{description:v=>{values.description=v;},price:v=>{values.price=v;}});while(pending.length)pending.shift()();return result;}
 return {render,values,unmount:()=>slots.forEach(x=>x.cleanup?.())};
}

test('черновики не переходят между аккаунтами',async()=>{
 const a=key(),b=key();await drafts.savePublicationDraft(a,{price:'4500'});assert.equal(await drafts.readPublicationDraft(b),null);assert.equal((await drafts.readPublicationDraft(a)).price,'4500');await drafts.clearPublicationDraft(a);
});
test('ошибка записи передаётся форме до проверки сессии',async()=>{
 const set=durableStorage.set;durableStorage.set=async()=>{throw Error('disk full');};
 try{await assert.rejects(drafts.savePublicationDraft(key(),{price:'4500'}),{code:'PUBLICATION_DRAFT_FAILED'});}finally{durableStorage.set=set;}
});
test('опубликованный черновик не восстанавливается при ошибке remove и новом запуске модуля',async()=>{
 const k=key();await drafts.savePublicationDraft(k,{price:'4500'});const remove=durableStorage.remove;
 durableStorage.remove=async()=>{throw Error('remove failed');};
 try{
  await drafts.clearPublicationDraft(k);assert.equal(await drafts.readPublicationDraft(k),null);
  const restarted=await import('../../src/utils/publicationDraft.js?restart-test');assert.equal(await restarted.readPublicationDraft(k),null);
 }finally{durableStorage.remove=remove;await durableStorage.remove(k);}
});
test('очередь save/save/clear не воскрешает опубликованную форму',async()=>{
 const k=key();const one=drafts.savePublicationDraft(k,{price:'100'});const two=drafts.savePublicationDraft(k,{price:'200'});const clear=drafts.clearPublicationDraft(k);
 await Promise.all([one,two,clear]);assert.equal(await drafts.readPublicationDraft(k),null);assert.equal(await durableStorage.get(k),null);
});
test('поздний успех удаляет только отправленную редакцию и только у её владельца',async()=>{
 const a=key(),b=key(),old={price:'100'},fresh={price:'200'};
 await drafts.savePublicationDraft(a,old);await drafts.savePublicationDraft(a,fresh);await drafts.savePublicationDraft(b,{price:'300'});
 await drafts.clearPublicationDraft(a,old);
 assert.deepEqual(await drafts.readPublicationDraft(a),fresh);assert.equal((await drafts.readPublicationDraft(b)).price,'300');
 await drafts.clearPublicationDraft(a,fresh);assert.equal(await drafts.readPublicationDraft(a),null);
 await drafts.clearPublicationDraft(b);
});
test('ошибка чтения при позднем успехе не удаляет неизвестную новую редакцию',async()=>{
 const k=key(),old={price:'100'},fresh={price:'200'};await drafts.savePublicationDraft(k,fresh);
 const get=durableStorage.get;durableStorage.get=async()=>{throw Error('temporary read failure');};
 try{await drafts.clearPublicationDraft(k,old);}finally{durableStorage.get=get;}
 assert.deepEqual(await drafts.readPublicationDraft(k),fresh);await drafts.clearPublicationDraft(k);
});
test('поздний clear реального hook сохраняет более новый черновик того же аккаунта',async()=>{
 const owner='revision-hook-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner),h=hookHarness(owner);
 try{
  h.render();await tick();h.render();h.values.price='100';const submitted=h.render();await submitted.save();
  h.values.price='200';const fresh=h.render();await fresh.save();await submitted.clear();
  assert.equal((await drafts.readPublicationDraft(k)).price,'200');
 }finally{h.unmount();await drafts.clearPublicationDraft(k);}
});
test('ошибка hydration не перезаписывает существующую форму пустыми значениями; retry восстанавливает',async()=>{
 const owner='hydration-test-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner);
 await drafts.savePublicationDraft(k,{description:'электросамокаты',price:'4500'});
 const get=durableStorage.get;let fail=true;durableStorage.get=async x=>{if(x===k&&fail)throw Error('temporary read failure');return get(x);};
 const h=hookHarness(owner);
 try{
  h.render();await tick();let result=h.render();assert.equal(result.ready,false);assert.equal(result.loadError,true);
  await new Promise(r=>setTimeout(r,280));assert.equal(JSON.parse(await get(k)).price,'4500');
  fail=false;result.retry();h.render();await tick();result=h.render();assert.equal(result.ready,true);assert.equal(h.values.description,'электросамокаты');assert.equal(h.values.price,'4500');
 }finally{h.unmount();durableStorage.get=get;await drafts.clearPublicationDraft(k);}
});

test('ключ и точный запрос с фото сохраняются при перезапуске и обычном autosave',async()=>{
 const owner='restart-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner),values={description:'контроль',photos:['file:temporary']};
 await drafts.savePublicationDraft(k,values);const op=await drafts.preparePublicationDraft(k,owner,'cargo',values);
 const body=await drafts.snapshotPublicationPayload(k,owner,'cargo',values,op.clientId,{price:4500,photos:['storage/uploaded-key']});
 await drafts.savePublicationDraft(k,values);
 const restarted=await import('../../src/utils/publicationDraft.js?operation-restart');
 const restored=await restarted.readPublicationDraft(k);assert.equal(restored._publication.clientId,op.clientId);
 const retry=await restarted.preparePublicationDraft(k,owner,'cargo',values);
 assert.equal(retry.clientId,op.clientId);assert.deepEqual(retry.replayPayload,body);
 await restarted.clearPublicationDraft(k,values,op.clientId);assert.equal(await restarted.readPublicationDraft(k),null);
});
test('изменённая форма сохраняет прежний ключ до явного начала новой операции',async()=>{
 const owner='change-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner),old={price:'100'},fresh={price:'200'};
 await drafts.savePublicationDraft(k,old);const op=await drafts.preparePublicationDraft(k,owner,'cargo',old);
 await drafts.snapshotPublicationPayload(k,owner,'cargo',old,op.clientId,{price:100});await drafts.savePublicationDraft(k,fresh);
 const retry=await drafts.preparePublicationDraft(k,owner,'cargo',fresh);assert.equal(retry.clientId,op.clientId);assert.equal(retry.replayPayload,null);
 const changed=await drafts.snapshotPublicationPayload(k,owner,'cargo',fresh,op.clientId,{price:200});assert.equal(changed.client_id,op.clientId);assert.equal(changed.price,200);
 assert.equal((await drafts.readPublicationDraft(k))._publication.payload.price,100);
 await drafts.resetPublicationOperation(k,op.clientId);assert.equal((await drafts.readPublicationDraft(k)).price,'200');
 assert.notEqual((await drafts.preparePublicationDraft(k,owner,'cargo',fresh)).clientId,op.clientId);await drafts.clearPublicationDraft(k);
});
test('конкурентная подготовка выдаёт один ключ и не переносит его другому владельцу',async()=>{
 const owner='race-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner);await drafts.savePublicationDraft(k,{price:'100'});
 const ops=await Promise.all(Array.from({length:5},()=>drafts.preparePublicationDraft(k,owner,'cargo',{price:'100'})));
 assert.equal(new Set(ops.map(x=>x.clientId)).size,1);
 await assert.rejects(drafts.preparePublicationDraft(k,'different-owner','cargo',{price:'100'}),{code:'PUBLICATION_DRAFT_FAILED'});
 assert.equal((await drafts.readPublicationDraft(k))._publication.ownerId,owner);await drafts.clearPublicationDraft(k);
});

test('поздний успех после повторного входа не даёт autosave другой формы создать новый ключ',async()=>{
 const owner='late-login-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner),first=hookHarness(owner),second=hookHarness(owner);
 try{
  first.render();await tick();first.render();first.values.price='4500';const submitted=first.render();await submitted.save();const op=await submitted.prepare();await submitted.snapshot(op.clientId,{price:4500});first.unmount();
  second.render();await tick();const restored=second.render();assert.equal(second.values.price,'4500');assert.equal((await restored.prepare()).clientId,op.clientId);
  await submitted.clear(op.clientId);
  await new Promise(r=>setTimeout(r,280));
  await assert.rejects(restored.save(),{code:'PUBLICATION_DRAFT_FAILED'});
  await assert.rejects(restored.prepare(),{code:'PUBLICATION_DRAFT_FAILED'});
  assert.equal(await drafts.readPublicationDraft(k),null);
  const fresh=hookHarness(owner);try{fresh.render();await tick();fresh.render();fresh.values.price='5000';const f=fresh.render();await f.save();assert.notEqual((await f.prepare()).clientId,op.clientId);}finally{fresh.unmount();}
 }finally{first.unmount();second.unmount();await durableStorage.remove(k);}
});

test('явный reset инвалидирует autosave другого экземпляра, сохраняя поля владельца',async()=>{
 const owner='reset-lease-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner),a=hookHarness(owner),b=hookHarness(owner);
 try{
  a.render();await tick();a.render();a.values.price='4500';const one=a.render();await one.save();const op=await one.prepare();await one.snapshot(op.clientId,{price:4500});
  b.render();await tick();const stale=b.render();await one.resetOperation(op.clientId);
  await assert.rejects(stale.save(),{code:'PUBLICATION_DRAFT_FAILED'});await assert.rejects(stale.prepare(),{code:'PUBLICATION_DRAFT_FAILED'});
  const current=a.render();await current.save();assert.notEqual((await current.prepare()).clientId,op.clientId);assert.equal((await drafts.readPublicationDraft(k)).price,'4500');
 }finally{a.unmount();b.unmount();await durableStorage.remove(k);}
});

test('поздний clear старого поколения не отключает autosave текущего hook',async()=>{
 const owner='same-hook-reset-'+(++sequence),k=drafts.publicationDraftKey('cargo',owner),h=hookHarness(owner);
 try{
  h.render();await tick();h.render();h.values.price='4500';const old=h.render();await old.save();const op=await old.prepare();await old.snapshot(op.clientId,{price:4500});
  await old.resetOperation(op.clientId);h.render();assert.equal(await old.clear(op.clientId),false);
  h.values.price='4600';h.render();await new Promise(r=>setTimeout(r,280));assert.equal((await drafts.readPublicationDraft(k)).price,'4600');
 }finally{h.unmount();await durableStorage.remove(k);}
});
