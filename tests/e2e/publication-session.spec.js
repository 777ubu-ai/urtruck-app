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
  localStorage.setItem('ur_external_feed_first_visit_v1:test-publication','1');localStorage.setItem('ur_external_feed_first_visit_v1:other-publication','1');
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
  else if(u.pathname==='/api/v1/driver/vehicles')data={vehicles:[]};
  else if(u.pathname.includes('/notifications'))data={notifications:[],unread:0,count:0};
  else if(u.pathname.includes('/chat/'))data={messages:[],rooms:[],unread:0};
  else if(u.pathname.includes('/market/cargos'))data={cargos:[],total:0};
  else if(u.pathname.includes('/market/trips'))data={trips:[],total:0};
  if(['POST','PUT','PATCH','DELETE'].includes(route.request().method()))box.writes.push(u.pathname);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('bottom-nav')).toBeAttached({timeout:20000});
 if(await page.getByTestId('external-feed-back').isVisible())await page.getByTestId('external-feed-back').click();
 await expect(page.getByTestId('bottom-nav')).toBeVisible();
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
 await page.getByTestId('cargo-price-field').fill('4500');await expect(page.getByTestId('cargo-desc-input')).toHaveValue('электросамокаты');
 await expect(page.getByTestId('cargo-submit-button')).toBeVisible();expect(box.errors).toEqual([]);
});


test('черновик сохраняется после reload и не появляется у другого аккаунта',async({page})=>{
 const box=await boot(page);await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await page.getByTestId('cargo-desc-input').fill('электросамокаты');await page.getByTestId('cargo-price-field').fill('4500');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ur_publication_draft_v1:cargo:test-publication')||'{}').price)).toBe('4500');
 await page.reload();if(await page.getByTestId('external-feed-back').isVisible())await page.getByTestId('external-feed-back').click();await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await expect(page.getByTestId('cargo-price-field')).toHaveValue('4500');await expect(page.getByTestId('cargo-desc-input')).toHaveValue('электросамокаты');
 box.accountId='other-publication';await page.evaluate(()=>{
  localStorage.setItem('ur_reg_token','other-synthetic-token');localStorage.setItem('ur_session',JSON.stringify({user:{id:'other-publication',role:'client'}}));
 });await page.reload();if(await page.getByTestId('external-feed-back').isVisible())await page.getByTestId('external-feed-back').click();await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await expect(page.getByTestId('cargo-price-field')).toHaveValue('');await expect(page.getByTestId('cargo-desc-input')).toHaveValue('');expect(box.errors).toEqual([]);
});


test('точный ввод: пробел, удаление, середина строки, вставка, перенос и китайская композиция',async({page})=>{
 const box=await boot(page);await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 const input=page.getByTestId('cargo-desc-input');
 await input.pressSequentially('Оборудование в деревянных ящиках ',{delay:8});
 await expect(input).toHaveValue('Оборудование в деревянных ящиках ');
 await input.press('Backspace');await expect(input).toHaveValue('Оборудование в деревянных ящиках');
 await input.evaluate(el=>{el.focus();el.setSelectionRange(15,15);});
 await page.keyboard.insertText('новых ');await expect(input).toHaveValue('Оборудование в новых деревянных ящиках');
 const pasted='Оборудование в деревянных ящиках\n设备 箱装  ';
 await input.fill(pasted);await page.getByTestId('cargo-price-field').fill('4500');
 await expect(input).toHaveValue(pasted);
 await input.focus();await input.dispatchEvent('compositionstart');
 await input.fill(pasted+'ni');await input.dispatchEvent('compositionupdate',{data:'ni'});
 await input.fill(pasted+'你');await input.dispatchEvent('compositionend',{data:'你'});
 await expect(input).toHaveValue(pasted+'你');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ur_publication_draft_v1:cargo:test-publication')||'{}').cargoDesc)).toBe(pasted+'你');
 await page.reload();if(await page.getByTestId('external-feed-back').isVisible())await page.getByTestId('external-feed-back').click();await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await expect(input).toHaveValue(pasted+'你');
 await input.evaluate(el=>{el.focus();el.setSelectionRange(el.value.length,el.value.length);});await page.keyboard.insertText(' продолжение ');await page.getByTestId('cargo-price-field').fill('5000');
 await expect(input).toHaveValue(pasted+'你 продолжение ');expect(box.errors).toEqual([]);
});

test('город сохраняет пробел при быстром вводе, а старые подсказки отменяются',async({page})=>{
 const box=await boot(page);await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 await page.getByText('Например, Хоргос',{exact:true}).click();
 const input=page.getByTestId('loc-search');await expect(input).toBeVisible();
 expect(await page.locator('[data-testid^="loc-country-"]').count()).toBeLessThan(50);
 for(const text of ['Нижний Новгород ', 'Нью Йорк ', 'Ростов-на-Дону']) {
  await input.fill('');await input.pressSequentially(text,{delay:5});await expect(input).toHaveValue(text);
  await expect(page.getByTestId('loc-search-loading')).toHaveCount(0,{timeout:10000});await expect(input).toHaveValue(text);
 }
 await input.fill('Нижний');await input.fill('北京');
 await expect(page.getByTestId('loc-point-Нижний Новгород')).toHaveCount(0);
 await page.getByTestId('loc-close').click();await expect(input).toHaveCount(0);
 expect(box.errors).toEqual([]);
});


test('многострочное описание не перекрывается справочными подсказками',async({page})=>{
 const box=await boot(page);await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId('mytrips-place-cargo').click();
 const input=page.getByTestId('cargo-desc-input');await input.fill('Оборудование в деревянных ящиках\nХрупкое 设备 箱装 ');
 const suggestions=page.getByTestId('cargo-desc-input-suggestions');await expect(suggestions).toBeAttached();
 const field=await input.boundingBox(),list=await suggestions.boundingBox();
 expect(list.y).toBeGreaterThanOrEqual(field.y+field.height-1);
 expect(list.height).toBeGreaterThan(0);
 await expect(input).toHaveValue('Оборудование в деревянных ящиках\nХрупкое 设备 箱装 ');
 expect(box.errors).toEqual([]);
});

for(const role of ['client','driver'])test(`${role}: быстрый возврат до autosave сохраняет последнее изменение`,async({page})=>{
 const box=await boot(page,{savedRole:role,actualRole:role});
 const open=async()=>{await page.getByTestId('bottom-nav-mywork').click();await page.getByTestId(role==='client'?'mytrips-place-cargo':'mytrips-publish-route').click();await expect(page.getByTestId(role==='client'?'cargo-submit-button':'trip-submit-button')).toBeVisible();};
 await open();
 if(role==='client')await page.getByTestId('cargo-desc-input').fill('Последний символ и пробел ');
 else{await page.getByText('Например, Алматы',{exact:true}).click();await page.getByTestId('loc-search').fill('Алматы ');await page.getByTestId('loc-point-Алматы').click();}
 // Не ждём 250-мс autosave: действие «Назад» должно само сохранить свежие поля.
 await page.getByTestId('brand-back').click();await expect(page.getByTestId('my-work-screen')).toBeVisible();await open();
 if(role==='client')await expect(page.getByTestId('cargo-desc-input')).toHaveValue('Последний символ и пробел ');
 else await expect(page.getByText('Алматы',{exact:true})).toBeVisible();
 expect(box.errors).toEqual([]);expect(box.writes).toEqual([]);
});
