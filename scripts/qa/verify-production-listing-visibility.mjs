// Только GET через публичный HTTPS. Файл с сессиями хранится вне git с0600.
// Запуск: node --experimental-loader ./tests/frontend/loader.mjs scripts/qa/verify-production-listing-visibility.mjs <evidence-directory>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import sucrase from 'sucrase';
import { marketAPI } from '../../src/utils/marketAPI.js';
import { storage } from '../../src/utils/storage.js';
import { normalizeTrip, sanitizeForDisplay, tripDisplay } from '../../src/utils/normalizers.js';
import { localizePlace, localizeCargoName } from '../../src/utils/places.js';
import { formatTruckType } from '../../src/utils/i18n.js';
import { flagCode } from '../../src/utils/countryFlags.js';
import { withAdditionalLanguageTree, localizeUiText } from '../../src/utils/additionalLocales.js';

const dir=process.argv[2];assert.ok(dir);
const proof=JSON.parse(fs.readFileSync(path.join(dir,'https-summary.json'),'utf8'));
const privateProof=JSON.parse(fs.readFileSync(path.join(dir,'personal-https-private.json'),'utf8'));
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  assert.ok(String(input).startsWith('https://urtruck.kz/api/v1/'),'только productionHTTPS');
  assert.equal(init?.method||'GET','GET','мутации запрещены');
  return nativeFetch(input,init);
};
const report={api:'https://urtruck.kz',public:{},personal:{},physical:'NOT RUN'};

for(const [role,file,key] of [['driver','CargoFeedScreen.js','cargos'],['client','FeedScreen.js','trips']]){
  const owner=privateProof.selected_sessions[role];await storage.set('ur_reg_token',owner.token);
  const source=fs.readFileSync('src/screens/'+file,'utf8');
  const cargoSource=fs.readFileSync('src/screens/CargoFeedScreen.js','utf8');
  const normalizers=new Function('sanitizeForDisplay',cargoSource.slice(cargoSource.indexOf('const FLAG_PAIR_RE'),cargoSource.indexOf('// CargoCard'))+'\nreturn {normalizeCargo,toIso};')(sanitizeForDisplay);
  const state={items:[],error:false};
  const env={useCallback:fn=>fn,pageRef:{current:{busy:false,nextOffset:null}},loadSeqRef:{current:0},listRef:{current:null},scrollOffsetRef:{current:0},
    setError:v=>{state.error=v;},setErrorAppend(){},setLoadingMore(){},setLoading(){},setRefreshing(){},setItems:v=>{state.items=typeof v==='function'?v(state.items):v;},
    dirFrom:'',dirTo:'',dirFromCountry:'',dirToCountry:'',filterType:'',dateFrom:'',dateTo:'',minPrice:'',maxPrice:'',priceCurrency:'USD',sortBy:'newest',savedOnly:false,
    myUserId:owner.id,toIso:normalizers.toIso,normalizeCargo:normalizers.normalizeCargo,normalizeTrip,marketAPI,console};
  const start=source.indexOf('  const load = useCallback('),end=source.indexOf('\n  useEffect(() => { load(); }',start);
  assert.ok(start>=0&&end>start);
  const load=new Function(...Object.keys(env),source.slice(start,end)+'\nreturn load;')(...Object.values(env));
  await load();let pages=1;
  while(env.pageRef.current.nextOffset!==null){assert.ok(pages<100);await load({append:true});pages++;}
  assert.equal(state.error,false);const ids=state.items.map(x=>x.id);
  assert.deepEqual([...ids].sort(),proof.public[key].ids);
  const cardName=role==='driver'?'CargoCard':'TripCard';
  const cardStart=source.indexOf('function '+cardName+'(');
  const cardEnd=source.indexOf('\nexport default function',cardStart);
  assert.ok(cardEnd>cardStart);
  // Выполняем настоящий card-компонент для каждой записи и проверяем егоprops.
  const cardCode=source.slice(cardStart,cardEnd);
  const scope={React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},MarketplaceCard:'MarketplaceCard',
    localizePlace,localizeCargoName,formatTruckType,flagCode,tripDisplay,localizeUiText,withAdditionalLanguageTree,
    styles:{cardSpacing:{}},formatPickupDate:v=>v,formatMoney:v=>String(v)};
  const exports={};
  vm.runInNewContext(sucrase.transform(cardCode+'\nexports.card='+cardName+';',{transforms:['jsx']}).code,{...scope,exports});
  const cardIds=state.items.map(item=>exports.card({item,lang:'RU',t:k=>k,copy:{negotiated:'Договорная',notSpecified:'Не указано'},saved:false}).props.testID);
  assert.deepEqual(cardIds,state.items.map(x=>(role==='driver'?'cargo':'trip')+'-card-'+x.id));
  report.public[role]={count:ids.length,pages,duplicates:ids.length-new Set(ids).size,sql_api_loader_card_id_match:true,ids:[...ids].sort()};
  const personal={};
  for(const [table,kind] of [['cargos','cargo'],['trips','trip']]){
    const ids=[];
    for(const section of ['active','history']){
      let offset=0;
      while(true){const page=await marketAPI.myListings({kind,section,limit:50,offset});assert.ok(!page.authRequired&&!page.serverError);ids.push(...page.items.map(x=>x.id));if(page.next_offset==null)break;assert.ok(page.next_offset>offset);offset=page.next_offset;}
    }
    assert.deepEqual([...ids].sort(),[...owner.expected[table]].sort());
    personal[table]={count:ids.length,duplicates:ids.length-new Set(ids).size,sql_api_loader_match:true};
  }
  report.personal[role]=personal;
}
fs.writeFileSync(path.join(dir,'client-visibility-proof.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,public:Object.fromEntries(Object.entries(report.public).map(([k,{ids,...v}])=>[k,v]))},null,2));
