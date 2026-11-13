import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPhotoWithRecovery } from '../../src/utils/chatMediaRecovery.js';

test('неподтверждённый старый ключ заменяется новой загрузкой без потери локального файла', async () => {
  const seen=[];
  const result=await sendPhotoWithRecovery({previousKey:'old',localUri:'local-photo',isCurrent:()=>true,
    upload:async uri=>{seen.push(['upload',uri]);return 'new'},
    send:async key=>{seen.push(['send',key]);if(key==='old')throw Object.assign(new Error('blocked'),{detail:'FILE_UPLOAD_REQUIRED'});return 'ok'},
    onKey:key=>seen.push(['key',key])});
  assert.equal(result,'ok');assert.deepEqual(seen,[['send','old'],['upload','local-photo'],['key','new'],['send','new']]);
});

test('другие ошибки и смена пользователя не запускают повторную загрузку', async () => {
  let uploads=0;
  await assert.rejects(sendPhotoWithRecovery({previousKey:'old',localUri:'local-photo',isCurrent:()=>true,
    upload:async()=>{uploads++;return 'new'},send:async()=>{throw Object.assign(new Error('denied'),{status:403,detail:'other'})}}));
  await assert.rejects(sendPhotoWithRecovery({previousKey:'old',localUri:'local-photo',isCurrent:()=>false,
    upload:async()=>{uploads++;return 'new'},send:async()=>{throw new Error('unexpected')}}),/CHAT_SESSION_CHANGED/);
  assert.equal(uploads,0);
});

test('запоздавшая загрузка предыдущего аккаунта не отправляется из нового', async () => {
  let current=true, sends=0, writes=0;
  await assert.rejects(sendPhotoWithRecovery({localUri:'local-photo',isCurrent:()=>current,
    upload:async()=>{current=false;return 'private-key'},send:async()=>{sends++},onKey:()=>{writes++}}),/CHAT_SESSION_CHANGED/);
  assert.equal(sends,0);assert.equal(writes,0);
});
