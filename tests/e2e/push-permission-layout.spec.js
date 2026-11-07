// Изолированная web-проверка: все API синтетические, внешняя сеть запрещена.
const {test,expect} = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4599';
if(new URL(BASE).hostname!=='127.0.0.1')throw Error('Разрешён только loopback');
for (const role of ['client','driver']) for (const lang of ['RU','ZH','EN']) for (const zoom of [100,130]) {
  test(`${role} ${lang} web-zoom${zoom}: активная старая публикация`, async({browser})=>{
    const context=await browser.newContext({serviceWorkers:'block', viewport:{width:zoom===100?390:300,height:zoom===100?844:649},deviceScaleFactor:zoom/100});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({role,lang})=>{
      if(window.Notification)Object.defineProperty(window.Notification,'permission',{configurable:true,get:()=> 'denied'});
      localStorage.setItem('ur_reg_token','synthetic-visual-token');
      localStorage.setItem('ur_session',JSON.stringify({user:{id:'visual-owner',role}}));
      localStorage.setItem('ur_verification_level','1');
      localStorage.setItem('ur_lang',lang);
      localStorage.setItem('ur_external_feed_first_visit_v1:visual-owner','1');
    },{role,lang});
    const item={id:'visual-listing',status:'active',published_at:'2026-08-01T12:00:00Z',created_at:'2026-08-01T12:00:00Z',
      [role==='client'?'owner_id':'driver_id']:'visual-owner',from_city:'Алматы',to_city:'Астана',from_country:'KZ',to_country:'KZ',
      ...(role==='client'?{cargo_desc:'Оборудование в ящиках',cargo_type:'tent'}:{}),truck_type:'tent',price:1000,currency:'USD',weight_tons:20,capacity_tons:20,available_m3:80,bids_count:0};
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.origin!==BASE)return route.abort();
      if(!u.pathname.startsWith('/api/') && !u.pathname.startsWith('/security/'))return route.continue();
      u.pathname=u.pathname.replace(/^\/security/,'');
      let data={};
      if(u.pathname==='/api/v1/register/me')data={id:'visual-owner',role,verification_level:1,basic_onboarding_completed:1};
      else if(u.pathname==='/api/v1/users/me')data={name:'Визуальная проверка',role};
      else if(u.pathname==='/api/v1/market/my')data={my_cargos:role==='client'?[item]:[],my_trips:role==='driver'?[item]:[],my_bids:[],incoming_bids:[],my_deals:[]};
      else if(u.pathname==='/api/v1/market/my/listings')data={items:u.searchParams.get('section')==='archive'?[]:[item],total:1,next_offset:null,archive_total:0};
      else if(u.pathname==='/api/v1/driver/vehicles')data={vehicles:[]};
      else if(u.pathname.includes('/notifications'))data={notifications:[],unread:0,count:0};
      else if(u.pathname.includes('/chat/'))data={messages:[],rooms:[],unread:0};
      else if(u.pathname.includes('/market/cargos'))data={cargos:[],total:0};
      else if(u.pathname.includes('/market/trips'))data={trips:[],total:0};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    try {
      await page.goto(BASE,{waitUntil:'domcontentloaded'});
      await expect(page.getByTestId('bottom-nav')).toBeVisible({timeout:20000});
      if(await page.getByTestId('external-feed-back').isVisible())await page.getByTestId('external-feed-back').click();
      await page.getByTestId('bottom-nav-mywork').click();
      await expect(page.getByTestId('my-work-screen')).toBeVisible();
      const card=page.getByTestId(role==='client'?'my-cargo-card':'my-trip-card');
      await expect(card).toHaveCount(1);await expect(card).toBeVisible();
      await expect.poll(()=>card.evaluate(el=>{let opacity=1;for(let n=el;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);return opacity>=0.95;})).toBe(true);
      await expect(card).not.toContainText(/Срок ист[её]к|Expired|已过期/);
      if(zoom===130){
        const banner=page.getByTestId('push-permission-banner');
        const title=banner.getByText({RU:'Не пропускайте предложения',ZH:'不要错过新报价',EN:'Don’t miss new offers'}[lang],{exact:true});
        expect((await title.boundingBox()).width).toBeGreaterThanOrEqual(130);
        expect((await banner.boundingBox()).height).toBeLessThan(240);
      }
      expect(errors).toEqual([]);
      const dir=path.resolve(__dirname,'../../test-results/push-permission-layout');fs.mkdirSync(dir,{recursive:true});
      await page.screenshot({path:path.join(dir,`${role}-${lang}-${zoom}.png`)});
    } finally {await context.close();}
  });
}
