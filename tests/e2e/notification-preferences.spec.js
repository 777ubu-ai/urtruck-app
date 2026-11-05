// Полный локальный UI/API; тестовые аккаунты создаются только на loopback.
const {test,expect}=require('@playwright/test');
const H=require('./helpers/webflow');
if(!['127.0.0.1','localhost'].includes(new URL(H.BASE).hostname))throw Error('Тест разрешён только на loopback');
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});
for(const role of ['driver','client'])test(`настройки напоминаний: ${role}, сохранение и перезапуск`,async({page,request},testInfo)=>{
 const email=`preferences-${role}-${Date.now()}@urtruck.qa`;
 const token=await H.apiEmailToken(request,email,role);
 const me=await (await request.get(`${H.API}/register/me`,{headers:{Authorization:`Bearer ${token}`}})).json();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(H.BASE);
 await page.evaluate(({token,me})=>{
  localStorage.setItem('ur_reg_token',token);
  localStorage.setItem('ur_session',JSON.stringify({user:{id:me.id,role:me.role}}));
  localStorage.setItem('ur_verification_level','2');localStorage.setItem('ur_lang','RU');
  localStorage.setItem(`ur_external_feed_first_visit_v1:${me.id}`,'1');
 },{token,me});
 async function settings(){
  await expect(page.getByTestId('bottom-nav')).toBeVisible({timeout:20000});
  await page.getByTestId('bottom-nav-feed').click();await page.getByTestId('feed-menu-btn').click();
  await page.getByTestId('profile-notification-settings').click();
  await expect(page.getByTestId('notification-preferences')).toBeVisible();
 }
 await page.reload();await settings();
 const noBids=page.getByRole('switch',{name:'Нет предложений',exact:true});
 await expect(noBids).toBeEnabled();await expect(noBids).not.toBeChecked();
 await noBids.click();await expect(noBids).toBeChecked();
 await page.getByTestId('notification-preferences').screenshot({path:testInfo.outputPath(`preferences-${role}.png`)});
 const result=await request.get(`${H.API}/push/preferences`,{headers:{Authorization:`Bearer ${token}`}});
 expect((await result.json()).preferences).toEqual({no_bids:true,inactivity:false,listing_lifecycle:false});
 await page.reload();await settings();await expect(page.getByRole('switch',{name:'Нет предложений',exact:true})).toBeChecked();
 await page.getByRole('switch',{name:'Нет предложений',exact:true}).click();await expect(page.getByRole('switch',{name:'Нет предложений',exact:true})).not.toBeChecked();
 expect(errors).toEqual([]);
});

for(const role of ['driver','client'])test(`первый вход ${role}: внешняя лента закрывается штатной кнопкой`,async({page,request})=>{
 const token=await H.apiEmailToken(request,`first-visit-${role}-${Date.now()}@urtruck.qa`,role);
 const me=await(await request.get(`${H.API}/register/me`,{headers:{Authorization:`Bearer ${token}`}})).json();
 await page.goto(H.BASE);
 await page.evaluate(({token,me})=>{
  localStorage.setItem('ur_reg_token',token);localStorage.setItem('ur_session',JSON.stringify({user:{id:me.id,role:me.role}}));
  localStorage.setItem('ur_verification_level','2');localStorage.removeItem(`ur_external_feed_first_visit_v1:${me.id}`);
 },{token,me});
 await page.reload();await expect(page.getByTestId('external-feed-back')).toBeVisible({timeout:20000});
 await H.dismissFirstVisit(page);await expect(page.getByTestId('bottom-nav-deals')).toBeVisible();
});
