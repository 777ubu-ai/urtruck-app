import test from 'node:test';
import assert from 'node:assert/strict';
import { storeTarget, assertStoreConfig } from '../../scripts/qa2-internal-store-config.mjs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
test('QA2 разрешён только во внутреннем треке, без подмены production',()=>{
 for(const track of ['production','alpha','beta','unknown'])assert.throws(()=>storeTarget('qa2',track));
 assert.throws(()=>storeTarget('unknown','internal'));
 assert.equal(storeTarget('production','production').api,'https://urtruck.kz');
 assert.equal(storeTarget('qa2','internal').api,'https://qa2.urtruck.kz');
});
test('реальный Expo config QA2 Internal проверяется по host/package/flavor',()=>{
 const before={...process.env};
 try{
  process.env.URTRUCK_QA2_INTERNAL_STORE='true';process.env.EXPO_PUBLIC_API_URL='https://qa2.urtruck.kz';delete process.env.URTRUCK_BUILD_FLAVOR;
  delete require.cache[require.resolve('../../app.config.js')];
  const config=require('../../app.config.js')({config:{version:'1.0.9',android:{package:'com.urtruck.app'}}});
  assert.doesNotThrow(()=>assertStoreConfig(config,'qa2','internal'));
  assert.throws(()=>assertStoreConfig(config,'production','internal'));
  for(const api of ['https://urtruck.kz','https://qa2.urtruck.kz.evil.test','http://qa2.urtruck.kz'])assert.throws(()=>assertStoreConfig({...config,extra:{...config.extra,urtruckApiUrl:api}},'qa2','internal'));
  assert.throws(()=>assertStoreConfig({...config,android:{package:'com.urtruck.app.qa2'}},'qa2','internal'));
 }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);delete require.cache[require.resolve('../../app.config.js')];}
});
test('SHA исходника включается только после строгой проверки',()=>{
 const before={...process.env};
 try{
  delete process.env.URTRUCK_QA2_INTERNAL_STORE;delete process.env.URTRUCK_BUILD_FLAVOR;delete process.env.EXPO_PUBLIC_API_URL;
  const load=()=>{delete require.cache[require.resolve('../../app.config.js')];return require('../../app.config.js')({config:{android:{package:'com.urtruck.app'}}});};
  process.env.URTRUCK_SOURCE_SHA='22c1e0c7fb76880c574945a9e59ba0d30355b352';assert.equal(load().extra.urtruckSourceSha,process.env.URTRUCK_SOURCE_SHA);
  process.env.URTRUCK_SOURCE_SHA='invalid';assert.throws(load);
 }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);delete require.cache[require.resolve('../../app.config.js')];}
});

test('встроенный SHA должен совпадать с проверенным исходником',()=>{
 const sha='22c1e0c7fb76880c574945a9e59ba0d30355b352';const config={android:{package:'com.urtruck.app'},extra:{urtruckApiUrl:'https://qa2.urtruck.kz',urtruckBuildFlavor:'production',urtruckSourceSha:sha}};
 assert.doesNotThrow(()=>assertStoreConfig(config,'qa2','internal',sha));
 assert.throws(()=>assertStoreConfig(config,'qa2','internal','0'.repeat(40)));
 assert.throws(()=>assertStoreConfig(config,'qa2','internal','bad'));
});
