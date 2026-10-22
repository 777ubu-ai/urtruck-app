// Реальная React-навигация; синтетические ответы только на loopback.
const {test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL || 'http://127.0.0.1:48299';
if(new URL(BASE).hostname!=='127.0.0.1')throw Error('Разрешён только loopback');
test.use({serviceWorkers:'block',viewport:{width:390,height:844},video:'off',trace:'off'});
async function boot(page,{savedRole='client',actualRole=savedRole,delayMe=false}={}){
 let release;const hold=new Promise(r=>{release=r;});const box={writes:[],errors:[],accountId:'test-publication',meStatus:200};
 page.on('pageerror',e=>box.errors.push(e.message));
 await page.addInitScript(role=>{
  if(localStorage.getItem('ur_reg_token'))return;
  localStorage.setItem('ur_reg_token','synthetic-publication-owner');
  localStorage.setItem('ur_session',JSON.stringify({user:{id:'test-publication',role}}));
  localStorage.setItem('ur_verification_level','1');localStorage.setItem('ur_lang','RU');
 },savedRole);
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==new URL(BASE).origin)return route.abort();
  if(!u.pathname.startsWith('/api/'))return route.continue();
  let data={};
  if(u.pathname==='/api/v1/register/me'){
   if(delayMe)await hold;
   if(box.meStatus!==200)return route.fulfill({status:box.meStatus,contentType:'application/json',body:'{"detail":"expired"}'});
   data={id:box.accountId,role:actualRole,verification_level:1,basic_onboarding_completed:1};
  }else if(u.pathname==='/api/v1/register/logout')data={ok:true};
  else if(u.pathname==='/api/v1/users/me')data={name:'Изолированный тест',role:actualRole};
  else if(u.pathname==='/api/v1/market/my')data={my_cargos:[],my_trips:[],my_bids:[],incoming_bids:[],my_deals:[]};
  else if(u.pathname==='/api/v1/market/my/listings')data={items:[],total:0,next_offset:null,archive_total:0};
  else if(u.pathname.includes('/notifications'))data={notifications:[],unread:0,count:0};
  else if(u.pathname.includes('/chat/'))data={messages:[],rooms:[],unread:0};
  else if(u.pathname.includes('/market/cargos'))data={cargos:[],total:0};
  else if(u.pathname.includes('/market/trips'))data={trips:[],total:0};
  if(['POST','PUT','PATCH','DELETE'].includes(route.request().method()))box.writes.push(u.pathname);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('bottom-nav')).toBeVisible({timeout:20000});
 box.release=release;return box;
}
test('восстановление серверной роли driver убирает stale client публикацию',async({page})=>{
 const box=await boot(page,{savedRole:'client',actualRole:'driver',delayMe:true});
 await page.getByTestId('bottom-nav-mywork').click();await expect(page.getByTestId('mytrips-place-cargo')).toBeVisible();
 box.release();await expect(page.getByTestId('mytrips-place-cargo')).toHaveCount(0);
 await page.getByTestId('bottom-nav-mywork').click();await expect(page.getByTestId('mytrips-publish-route')).toBeVisible();
 expect(box.writes.filter(x=>x.endsWith('/cargos'))).toEqual([]);expect(box.errors).toEqual([]);
});
test('грузоотправитель штатно открывает форму груза',async({page})=>{
 const box=await boot(page);await page.getByTestId('bottom-nav-mywork').click();
 await page.getByTestId('mytrips-place-cargo').click();
 await expect(page.getByTestId('cargo-desc-input')).toBeVisible();await page.getByTestId('cargo-desc-input').fill('электросамокаты');
 await page.getByTestId('cargo-price-field').fill('4500');await expect(page.getByTestId('cargo-desc-input')).toHaveValue('Электросамокаты');
 await expect(page.getByTestId('cargo-submit-button')).toBeVisible();expect(box.errors).toEqual([]);
});


test('черновик сохраняется после reload и не появляется у другого аккаунта',async({page})=>{
 const box=await boot(page);await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await page.getByTestId('cargo-desc-input').fill('электросамокаты');await page.getByTestId('cargo-price-field').fill('4500');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ur_publication_draft_v1:cargo:test-publication')||'{}').price)).toBe('4500');
 await page.reload();await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await expect(page.getByTestId('cargo-price-field')).toHaveValue('4500');await expect(page.getByTestId('cargo-desc-input')).toHaveValue('Электросамокаты');
 box.accountId='other-publication';await page.evaluate(()=>{
  localStorage.setItem('ur_reg_token','other-synthetic-token');localStorage.setItem('ur_session',JSON.stringify({user:{id:'other-publication',role:'client'}}));
 });await page.reload();await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await expect(page.getByTestId('cargo-price-field')).toHaveValue('');await expect(page.getByTestId('cargo-desc-input')).toHaveValue('');expect(box.errors).toEqual([]);
});
