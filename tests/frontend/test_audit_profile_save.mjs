import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/screens/EditProfileScreen.js','utf8');
const body = source.split('const finishSave = async (phoneConfirmed = false) => {')[1].split('\n  };')[0];
function saveHarness(persistProfile) {
  const calls=[];
  const env={persistProfile, clearDraft:async()=>calls.push('clear'),draftKey:'qa',toast:(_text,kind)=>calls.push(kind),t:k=>k,navigation:{goBack:()=>calls.push('back')},setSaving:v=>calls.push(['saving',v])};
  return {calls,run:new Function(...Object.keys(env),`return async function(phoneConfirmed=false){${body}}`)(...Object.values(env))};
}
for(const response of [{ok:false,status:401},{ok:false,status:422},{ok:false,status:500},{ok:false,networkError:true}]) {
  test(`failed profile save preserves form/draft ${JSON.stringify(response)}`,async()=>{
    const h=saveHarness(async()=>response);await h.run();
    assert.equal(h.calls.includes('clear'),false);assert.equal(h.calls.includes('back'),false);
    assert.ok(h.calls.includes('error'));assert.deepEqual(h.calls.at(-1),['saving',false]);
  });
}
test('thrown network error does not destroy recoverable edits',async()=>{
  const h=saveHarness(async()=>{throw Error('offline')});await h.run();
  assert.equal(h.calls.includes('clear'),false);assert.equal(h.calls.includes('back'),false);
});
test('confirmed save clears draft before returning and releases busy state',async()=>{
  const h=saveHarness(async()=>({ok:true}));await h.run();
  assert.ok(h.calls.indexOf('clear')<h.calls.indexOf('back'));
  assert.ok(h.calls.includes('success'));assert.deepEqual(h.calls.at(-1),['saving',false]);
});
test('profile hydration never overwrites a field edited during the request',()=>{
  const hydrate=source.split('const restore = (key, setter, value) => {')[1].split('\n      };')[0];
  const editedFields={current:new Set(['city'])};const calls=[];
  const restore=new Function('editedFields',`return (key,setter,value)=>{${hydrate}}`)(editedFields);
  restore('city',v=>calls.push(v),'old city');restore('country',v=>calls.push(v),'Germany');
  assert.deepEqual(calls,['Germany']);
});
