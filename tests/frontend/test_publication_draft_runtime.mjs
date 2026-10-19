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
