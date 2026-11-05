import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { storage } from '../../src/utils/storage.js';
import { push } from '../../src/utils/push.js';

test('настройки напоминаний используют текущую авторизацию при смене аккаунта', async () => {
  const before = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url,options});
    return { ok: true, json: async () => ({preferences:{no_bids:false,inactivity:false,listing_lifecycle:false}}) };
  };
  try {
    await storage.remove('ur_reg_token');
    assert.equal((await push.notificationPreferences()).ok, false);
    assert.equal(calls.length, 0);
    await storage.set('ur_reg_token','synthetic-account-A');
    await push.notificationPreferences();
    await storage.set('ur_reg_token','synthetic-account-B');
    const result = await push.notificationPreferences({no_bids:false});
    assert.equal(result.ok, true);
    assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-account-A');
    assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-account-B');
    assert.equal(calls[0].options.method,'GET');
    assert.equal(calls[1].options.method,'PATCH');
    assert.deepEqual(JSON.parse(calls[1].options.body),{no_bids:false});
  } finally { globalThis.fetch = before; await storage.remove('ur_reg_token'); }
});

test('сбой сети не подтверждает сохранение preferences', async () => {
  const before = globalThis.fetch;
  try {
    await storage.set('ur_reg_token','synthetic-account');
    globalThis.fetch = async () => { throw new Error('synthetic-offline'); };
    assert.equal((await push.notificationPreferences({inactivity:true})).ok,false);
  } finally { globalThis.fetch = before; await storage.remove('ur_reg_token'); }
});

test('Service Worker принимает старый и вложенный URL и не объединяет разные event ID', async () => {
  const handlers = {}; const displays=[];
  vm.runInNewContext(readFileSync('sw-template.js','utf8'),{self:{addEventListener:(type,cb)=>{handlers[type]=cb;},registration:{showNotification:async(title,options)=>{displays.push(options);}}}});
  for (const payload of [
    {title:'Тест',url:'/trips/one',data:{event_id:'one'}},
    {title:'Тест',data:{url:'/cargos/two',event_id:'two'}},
  ]) {
    let done;handlers.push({data:{json:()=>payload},waitUntil:(p)=>{done=p;}});await done;
  }
  assert.equal(displays[0].data,'/trips/one');assert.equal(displays[1].data,'/cargos/two');
  assert.notEqual(displays[0].tag,displays[1].tag);
});

test('добавление preferences не меняет прежние push registration/logout/ownership handlers', () => {
  const source=readFileSync('backend/api/push.py','utf8');
  const start=source.indexOf('\n\nclass NotificationPreferencesIn(');
  const end=source.indexOf('\n\nVAPID_PUBLIC',start);
  assert.ok(start>0 && end>start);
  const previous=source.slice(0,start)+source.slice(end);
  assert.equal(createHash('sha256').update(previous).digest('hex'),'dacca8870866a5a493112707b0adccde5157b75ccc4a28dca63cdb7fc150ed86');
});


test('профиль сохраняет прежнюю реализацию и добавляет только вход в настройки', () => {
  const source=readFileSync('src/screens/ProfileScreen.js','utf8');
  const added="      { icon: 'sliders', label: `${t('push_title')}: ${t('push_categories')}`, screen: 'PushFilter', testID: 'profile-notification-settings' },\n";
  assert.equal(source.split(added).length,2);
  assert.equal(createHash('sha256').update(source.replace(added,'')).digest('hex'),'583680b46e46ab6cef6b0177ab2331df267a4d111bdb7bd47d0326d30add0777');
});
