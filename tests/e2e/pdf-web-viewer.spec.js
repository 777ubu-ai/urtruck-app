// Изолированный web viewer: документ и сетевые сбои синтетические.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const H = require('./helpers/webflow');
if (!['127.0.0.1','localhost'].includes(new URL(H.BASE).hostname)) throw Error('Разрешён только локальный стенд');
const pdf = fs.readFileSync('tests/fixtures/pdf/local-test.pdf');
test('PDF реально рисуется; ошибка сети и истёкшая ссылка видимы, повтор работает', async ({page}) => {
  let response = 'ok';
  const serve = async route => {
    if (response === 'offline') return route.abort('failed');
    if (response === 'expired') return route.fulfill({status:403,body:'expired'});
    return route.fulfill({status:200,contentType:'application/pdf',body:pdf});
  };
  await page.route('**/security/storage/qa-pdf-fixture.pdf*', serve);
  await page.route('**/qa2/storage/qa-pdf-fixture.pdf*', serve);
  await page.goto(H.BASE);
  await page.evaluate(() => {
    const frame=document.createElement('iframe');frame.id='qa-pdf-viewer';frame.src='/pdf-viewer/index.html';
    frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:99999';
    document.body.appendChild(frame);
    window.addEventListener('message',event=>{
      if(event.source===frame.contentWindow&&event.origin===location.origin&&event.data?.channel==='urtruck-pdf-viewer'&&event.data.type==='ready')
        frame.contentWindow.postMessage({channel:'urtruck-pdf-parent',type:'open',url:'/security/storage/qa-pdf-fixture.pdf',language:'RU'},location.origin);
    });
  });
  const frame=page.frameLocator('#qa-pdf-viewer');
  await expect(frame.locator('#page')).toBeVisible({timeout:30000});
  expect(await frame.locator('#page').evaluate(canvas => {
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]&&pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180)ink++;
    return ink;
  })).toBeGreaterThan(10);
  await expect(frame.locator('#page-count')).toHaveText('1 / 1');
  response='expired'; await page.evaluate(()=>{const f=document.querySelector('#qa-pdf-viewer');f.contentWindow.postMessage({channel:'urtruck-pdf-parent',type:'open',url:'/security/storage/qa-pdf-fixture.pdf',language:'RU'},location.origin)});
  await expect(frame.locator('#retry')).toBeVisible();
  response='offline';await frame.locator('#retry').click();await expect(frame.locator('#retry')).toBeVisible();
  response='ok';await frame.locator('#retry').click();await expect(frame.locator('#page')).toBeVisible();
  const qa2Response=page.waitForResponse(response=>response.url().includes('/qa2/storage/qa-pdf-fixture.pdf'));
  await page.evaluate(()=>{const f=document.querySelector('#qa-pdf-viewer');f.contentWindow.postMessage({channel:'urtruck-pdf-parent',type:'open',url:'/qa2/storage/qa-pdf-fixture.pdf',language:'RU'},location.origin)});
  expect((await qa2Response).status()).toBe(200);
  await expect(frame.locator('#page')).toBeVisible();
  await page.locator('#qa-pdf-viewer').evaluate(node=>node.remove());
  await expect(page.locator('#qa-pdf-viewer')).toHaveCount(0);
});
