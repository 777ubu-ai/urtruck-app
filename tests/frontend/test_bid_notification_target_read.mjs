import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('src/utils/marketAPI.js','utf8');
for (const [method,kind,next] of [['getCargo','cargos','deleteCargo'],['getTrip','trips','updateTrip']]) {
  test(`${method} sends the selected bid and preserves ordinary detail requests`,async()=>{
    const body=source.slice(source.indexOf(`  async ${method}(`),source.indexOf(`  async ${next}(`)).trim().replace(/,\s*$/,'');
    const calls=[];
    const api=vm.runInNewContext(`({${body}})`,{BASE:'/api/v1/market',encodeURIComponent,headers:async()=>({Authorization:'test'}),authedFetch:async(url,options)=>{calls.push({url,options});return {json:async()=>({})}}});
    await api[method]('listing','bid 1'); await api[method]('listing');
    assert.equal(calls[0].url,`/api/v1/market/${kind}/listing?bid_id=bid%201`);
    assert.equal(calls[1].url,`/api/v1/market/${kind}/listing`);
    assert.equal(calls[0].options.headers.Authorization,'test');
  });
}
for(const [file,method,id] of [['CargoDetail.js','getCargo','cid'],['TripDetail.js','getTrip','tid']]) {
  test(`${file} forwards the bid selected in the archive`,()=>{
    const screen=readFileSync(`src/screens/${file}`,'utf8');
    assert.match(screen,/bidId:\s*routeBidId/);
    assert.ok(screen.includes(`marketAPI.${method}(${id}, routeBidId)`));
  });
}
