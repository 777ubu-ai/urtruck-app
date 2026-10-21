const http=require('http'),fs=require('fs'),path=require('path');
const host='127.0.0.1',port=8770,sha='f4575bc9+compact-ui-working-tree',dir=process.env.EXTERNAL_FEED_TEST_DIST||'/tmp/urtruck-external-compact-web-20261022';
let offline=false;const saved=new Set();const log=[];const now=new Date().toISOString();
const items=[
{id:'test-usd',kind:'cargo',status:'active',origin:'Хоргос',destination:'Алматы',origin_country:'CN',destination_country:'KZ',cargo_name:'ТЕСТ: электросамокаты',body_types:['tent'],weight:25,volume:150,vehicle_count:1,amount:4500,currency:'USD',price_state:'known',original_text:Array.from({length:24},(_,i)=>'ТЕСТОВЫЙ ГРУЗ. Условие '+(i+1)+': нужен тент, груз готов, исходный текст сохранён полностью.').join('\n'),contacts:['+1 202 555 0101'],source_published_at:now},
{id:'test-kzt',kind:'cargo',status:'active',origin:'Астана',destination:'Алматы',origin_country:'KZ',destination_country:'KZ',cargo_name:'ТЕСТ: упаковка',body_types:['ref'],amount:1500,currency:'KZT',price_state:'known',original_text:'ТЕСТОВЫЙ СТЕНД. Астана → Алматы. Нужен реф. Цена 1 500 KZT. Валюта источника KZT, пересчёта нет.',contacts:['+1 202 555 0102'],source_published_at:now},
{id:'test-vehicle',kind:'vehicle',status:'active',origin:'Алматы',destination:'Астана',body_types:['tent'],weight:20,volume:90,vehicle_count:1,amount:3000,currency:'USD',price_state:'known',original_text:Array.from({length:24},(_,i)=>'ТЕСТОВАЯ МАШИНА. Условие '+(i+1)+': свободный тент, документы готовы.').join('\n'),contacts:['+1 202 555 0103'],source_published_at:now}
];
function user(role){return{id:'physical-stand-'+role,role,verification_level:3,basic_onboarding_completed:1,name:'Тестовый стенд'};}
function reply(res,code,data){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
http.createServer((req,res)=>{
const u=new URL(req.url,'http://'+host+':'+port),p=u.pathname.replace(/^\/security(?=\/api\/)/,'');
if(p==='/qa-start'){
const role=u.searchParams.get('role')==='driver'?'driver':'client';const boot=JSON.stringify(user(role));
res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(`<script>localStorage.setItem('ur_session',JSON.stringify({user:${boot}}));localStorage.setItem('ur_reg_token','synthetic-stand-${role}');localStorage.setItem('ur_verification_level','3');localStorage.setItem('ur_lang','RU');localStorage.setItem('ur_theme','light');location.replace('/')</script>`);
}
if(p==='/test-control'){if(u.searchParams.has('offline'))offline=u.searchParams.get('offline')==='1';return reply(res,200,{offline,sha,source:'synthetic stand',events:log});}
if(p.startsWith('/api/')){
const role=(req.headers.authorization||'').includes('stand-driver')?'driver':'client',kind=role==='driver'?'cargo':'vehicle';
log.push({at:Date.now(),path:p,query:Object.fromEntries(u.searchParams),method:req.method,role});
if(log.length>300)log.shift();
if(p.includes('/external-freight')&&offline)return reply(res,503,{detail:{error:'network_error'}});
if(p==='/api/v1/register/me'||p==='/api/v1/users/me')return reply(res,200,user(role));
if(p==='/api/v1/external-freight/count')return reply(res,200,{kind,count:items.filter(i=>i.kind===kind).length});
if(p.endsWith('/bookmark')){const id=p.split('/').at(-2),key=role+':'+id;if(req.method==='PUT')saved.add(key);else saved.delete(key);return reply(res,200,{id,saved:saved.has(key)});}
if(p==='/api/v1/external-freight'){
const q=u.searchParams;let list=items.filter(i=>i.kind===kind).map(i=>({...i,saved:saved.has(role+':'+i.id)}));
if(q.get('saved_only')==='true')list=list.filter(i=>i.saved);
for(const field of ['origin','destination'])if(q.get(field))list=list.filter(i=>i[field].toLowerCase().startsWith(q.get(field).toLowerCase()));
for(const field of ['origin_country','destination_country','currency'])if(q.get(field))list=list.filter(i=>i[field]===q.get(field));
if(q.get('body_type'))list=list.filter(i=>i.body_types.includes(q.get('body_type')));
if(q.get('min_price'))list=list.filter(i=>i.amount>=+q.get('min_price'));
if(q.get('max_price'))list=list.filter(i=>i.amount<=+q.get('max_price'));
if(q.get('published_from'))list=list.filter(i=>i.source_published_at>=q.get('published_from'));
if(q.get('published_to'))list=list.filter(i=>i.source_published_at<=q.get('published_to'));
return reply(res,200,{items:list,next_cursor:null});
}
if(p.includes('/notifications'))return reply(res,200,{notifications:[],unread:0});
if(p.includes('/chat/'))return reply(res,200,{messages:[],rooms:[],unread:0});
if(p.endsWith('/market/my'))return reply(res,200,{my_cargos:[],my_trips:[],my_bids:[],incoming_bids:[],my_deals:[]});
if(p.endsWith('/market/my/listings'))return reply(res,200,{items:[],total:0,archive_total:0});
if(p.includes('/market/cargos'))return reply(res,200,{cargos:[],total:0});
if(p.includes('/market/trips'))return reply(res,200,{trips:[],total:0});
if(p.includes('/favorites'))return reply(res,200,{favorites:[]});
return reply(res,200,{});
}
let file=path.resolve(dir,'.'+p);if(!file.startsWith(dir+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile())file=dir+'/index.html';
const ext=path.extname(file),types={'.js':'application/javascript','.html':'text/html','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'};
res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});
if(ext==='.html'){
let html=fs.readFileSync(file,'utf8');html=html.replace('</head>',`<style>body::before{content:'ТЕСТОВЫЙ СТЕНД · COMPACT UI · СИНТЕТИЧЕСКИЕ ДАННЫЕ';position:fixed;top:0;left:0;right:0;height:24px;background:#ffe0a3;color:#34260b;z-index:99999;font:10px/24px sans-serif;text-align:center;pointer-events:none}#root{padding-top:24px;box-sizing:border-box}</style></head>`);return res.end(html);
}
fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://'+host+':'+port,sha,data:'synthetic only'})));
