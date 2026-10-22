const { chromium, expect } = require('@playwright/test');
const fs = require('fs'), cp = require('child_process');
const path = require('path');
const root = process.cwd();
const out = path.join(root,'docs/qa/external-freight-feed-20261020/compact-ui-20261022');
fs.mkdirSync(out,{recursive:true});
const resultPath=path.join(out,'physical-results.json');
const results = process.env.DEVICE_FILTER && fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath,'utf8')).filter(x=>x.name!==process.env.DEVICE_FILTER) : [];
(async()=>{
 for (const [name,serial,port,role,id] of [
  ['huawei',process.env.HUAWEI_SERIAL,9223,'driver','test-usd'],
  ['xiaomi',process.env.XIAOMI_SERIAL,9224,'client','test-vehicle']
 ]) {
  if(process.env.DEVICE_FILTER && name!==process.env.DEVICE_FILTER)continue;
  if(!serial)throw new Error('Set HUAWEI_SERIAL/XIAOMI_SERIAL from adb devices -l');
  let browser = await chromium.connectOverCDP('http://127.0.0.1:'+port);
  const context = browser.contexts()[0];
  let page = await context.newPage(); page.setDefaultTimeout(15000); console.log(name+": start");
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url = new URL(route.request().url());
   return url.origin === 'http://127.0.0.1:8770' ? route.continue() : route.abort();
  });
  await page.goto('http://127.0.0.1:8770/qa-start?role='+role,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('bottom-nav')).toBeVisible({timeout:30000});
  if(role==='client')await page.getByTestId('bottom-nav-feed').click();
  await page.getByTestId('external-freight-entry').click();
  const card=page.getByTestId('external-feed-card-'+id);
  await expect(card).toBeVisible();
  const title=await page.getByTestId('external-feed-title').textContent();
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth}));
  function shot(label){ const file=path.join(out,name+'-'+label+'-STAND.png'); fs.writeFileSync(file,cp.execFileSync('adb',['-s',serial,'exec-out','screencap','-p'])); return file; }
  const collapsed=await card.boundingBox(); shot('collapsed');
  const toggle=page.getByTestId('external-feed-expand-'+id);
  await expect(toggle).toBeVisible(); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  const description=page.getByTestId('external-feed-description-'+id);
  await expect(description).toContainText('Условие 24');
  await card.scrollIntoViewIfNeeded();shot('expanded');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  const bookmark=page.getByTestId('external-feed-bookmark-'+id);
  if(await bookmark.getAttribute('aria-label')==='Сохранить') await bookmark.click(); await expect(bookmark).toHaveAttribute('aria-label','Убрать из сохранённых');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('bottom-nav')).toBeVisible({timeout:30000});
  if(role==='client')await page.getByTestId('bottom-nav-feed').click();
  await page.getByTestId('external-freight-entry').click();
  await expect(bookmark).toHaveAttribute('aria-label','Убрать из сохранённых');
  await page.getByTestId('external-feed-saved-only').click();
  await expect(card).toBeVisible(); shot('saved');
  await page.getByTestId('external-feed-saved-only').click();
  await expect(card).toBeVisible();
  await page.bringToFront();
  shot('final-card');
  // Закрываем только вкладки отдельного synthetic origin, созданные этими прогонами.
  for(const other of context.pages())if(other!==page && other.url().startsWith('http://127.0.0.1:8770'))await other.close();
  results.push({name,serialSuffix:serial.slice(-4),role,title,metrics,collapsed,errors,checks:['collapse/full text 24 conditions/collapse','bookmark survives reload and saved-only'],source:'physical Chrome; synthetic data; working tree UI patch; no APK'});
  fs.writeFileSync(path.join(out,'physical-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.at(-1)));
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
