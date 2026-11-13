const { test, expect } = require('@playwright/test');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4799';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Тест восстановления требует локальную web-сборку');

async function setup(page, status, role = 'client') {
  const errors = [], sends = [], favoriteHeaders = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(r => {
    if (sessionStorage.getItem('session-fixture')) return;
    sessionStorage.setItem('session-fixture','1');
    localStorage.setItem('ur_reg_token','old-A');
    localStorage.setItem('ur_session',JSON.stringify({apiBase:'/api/v1',user:{id:'A',role:r}}));
    localStorage.setItem('ur_verification_level','1');
    localStorage.setItem('ur_publication_draft_v1:cargo:A',JSON.stringify({description:'РаботаA'}));
    localStorage.setItem('ur_draft_registration',JSON.stringify({name:'Общая формаA'}));
    localStorage.setItem('ur_chat_outbox',JSON.stringify([{clientId:'keep-A',userId:'A',payload:{text:'Не отправленоA'}}]));
    for (const id of ['A','B']) localStorage.setItem('ur_external_feed_first_visit_v1:'+id,'1');
  },role);
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),bearer=request.headers().authorization;
    if(url.pathname.endsWith('/market/trips') && url.searchParams.get('saved_only')==='true')favoriteHeaders.push(bearer);
    let body={ok:true,items:[],threads:[],favorites:[],my_cargos:[],my_trips:[],my_bids:[],incoming_bids:[],my_deals:[],count:0};
    if(url.pathname.endsWith('/register/me')){
      if(bearer==='Bearer old-A' && status==='offline')return route.abort('internetdisconnected');
      if(bearer==='Bearer old-A' && status!==200)return route.fulfill({status,contentType:'application/json',body:'{"detail":"rejected"}'});
      body={id:bearer==='Bearer new-B'?'B':'A',role,verification_level:1};
    } else if(url.pathname.endsWith('/register/email/send')) body={sent:true,mock:true,code:'0000',channel:'email'};
    else if(url.pathname.endsWith('/register/email/verify'))body={token:'new-B',user_id:'B',role,verification_level:1,is_new:false};
    else if(url.pathname.endsWith('/users/me'))body={id:bearer==='Bearer new-B'?'B':'A',name:'Проверка',role};
    else if(url.pathname.includes('/my/listings'))body={items:[],next_offset:null,history_total:0,total:0};
    else if(/\/market\/(cargos|trips)$/.test(url.pathname))body={cargos:[],trips:[],total:0,has_more:false,next_offset:null,search_contract:1};
    else if(url.pathname.endsWith('/external-freight/count'))body={kind:role==='driver'?'cargo':'vehicle',count:0,offer_count:0,carrier_count:0};
    else if(url.pathname.endsWith('/chat/send'))sends.push(request.postData());
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  return {errors,sends,favoriteHeaders};
}

for(const role of ['driver','client'])test(`${role}:401 открывает повторный вход с сохранением работы`,async({page})=>{
  const state=await setup(page,401,role);
  await expect(page.getByTestId('session-recovery-message')).toBeVisible();
  await expect(page.getByTestId('auth-v2-screen')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('ur_reg_token'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('ur_publication_draft_v1:cargo:A'))).toContain('РаботаA');
  expect(await page.evaluate(()=>localStorage.getItem('ur_chat_outbox'))).toContain('Не отправленоA');
  expect(await page.evaluate(()=>localStorage.getItem('ur_draft_registration'))).toBeNull();
  expect(state.errors).toEqual([]);expect(state.sends).toEqual([]);
});

for(const status of [403,503,'offline'])test(`${status}: временный отказ не удаляет действующую сессию`,async({page})=>{
  const state=await setup(page,status);
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.getByTestId('session-recovery-message')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('ur_reg_token'))).toBe('old-A');
  expect(state.errors).toEqual([]);
});

test('после401 входB не получает общую форму и очередьA',async({page})=>{
  const state=await setup(page,401);
  await expect(page.getByTestId('session-recovery-message')).toBeVisible();
  await page.getByTestId('email-v2-input').fill('b@example.test');
  await page.getByTestId('phone-v2-cta').click();
  await expect(page.getByTestId('otp-v2-screen')).toBeVisible();
  await page.getByTestId('otp-v2-input').fill('0000');
  await expect(page.getByTestId('bottom-nav')).toBeVisible({timeout:20000});
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ur_session')||'{}')?.user?.id)).toBe('B');
  expect(await page.evaluate(()=>localStorage.getItem('ur_draft_registration'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('ur_chat_outbox'))).toContain('Не отправленоA');
  expect(state.errors).toEqual([]);expect(state.sends).toEqual([]);
});

test('избранные рейсы передают bearer текущего аккаунта из настоящего UI',async({page})=>{
  const state=await setup(page,200);
  await page.getByTestId('bottom-nav-feed').click();
  await page.getByTestId('trip-filter-favorites').click();
  await expect.poll(()=>state.favoriteHeaders).toEqual(['Bearer old-A']);
  expect(state.errors).toEqual([]);
});
