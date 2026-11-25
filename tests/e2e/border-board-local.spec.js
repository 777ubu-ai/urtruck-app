const { test, expect } = require('@playwright/test');
const H = require('./helpers/webflow');
test('board opens and filters loaded rows', async ({ page }) => {
  await page.route('**/borders/catalog', async route => route.fulfill({json:{checkpoints:[{id:'bahty_pokitu',name:'Бахты - Покиту',name_ru:'Бахты - Покиту',country:'CN'}],countries:[{country:'CN'}]}}));
  await page.route('**/borders/board?*', async route => route.fulfill({json:{enabled:true,rows:[{plate:'TEST111',checkpoint:'Бахты - Покиту',queue_datetime:'25.11.2026 10:00',status:'in_queue',status_raw:'В очереди'},{plate:'TEST222',checkpoint:'Бахты - Покиту',queue_datetime:'25.11.2026 11:00',status:'called',status_raw:'Вызван на пункт пропуска'}]}}));
  await H.emailLogin(page, `board-${Date.now()}@urtruck.kz`, 'driver');
  await page.locator(H.tid('bottom-nav-queue')).click();
  await page.getByTestId('border-tab-board').click();
  await expect(page.getByTestId('border-board-screen')).toBeVisible();
  await page.getByTestId('border-board-screen').getByText('Бахты - Покиту', {exact:true}).first().click();
  await expect(page.getByText('TEST111')).toBeVisible();
  await page.getByTestId('border-board-search').fill('TEST222');
  await expect(page.getByText('TEST222')).toBeVisible();
  await expect(page.getByText('TEST111')).toHaveCount(0);
});
