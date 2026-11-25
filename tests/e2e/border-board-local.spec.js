const { test, expect } = require('@playwright/test');
const H = require('./helpers/webflow');

test('online board searches beyond the current page and keeps the selected checkpoint', async ({ page }) => {
  const checkpoint = { id: 'bahty_pokitu', name: 'Бахты - Покиту', name_ru: 'Бахты - Покиту', country: 'CN' };
  await page.route('**/borders/catalog', route => route.fulfill({
    json: { checkpoints: [checkpoint], countries: [{ country: 'CN' }] },
  }));
  const requests = [];
  await page.route('**/borders/online-board?*', route => {
    const query = new URL(route.request().url()).searchParams;
    requests.push({ checkpoint: query.get('checkpoint'), plate: query.get('plate'), page: query.get('page') });
    const current = Number(query.get('page'));
    const searching = Boolean(query.get('plate'));
    const plate = searching || current === 2 ? 'TEST222' : 'TEST111';
    return route.fulfill({ json: {
      rows: [{ plate, checkpoint: checkpoint.name, date: '25.11.2026', slot: '11:00–12:00', status: 'В очереди' }],
      statuses: [{ code: 'Pending', label: 'В очереди' }],
      total: searching ? 1 : 2,
      page: current,
      has_next: current === 1 && !searching,
      updated_at: '2026-11-25T12:00:00Z',
    } });
  });
  await H.emailLogin(page, 'board-' + Date.now() + '@urtruck.kz', 'driver');
  await page.locator(H.tid('bottom-nav-queue')).click();
  await page.getByTestId('border-tab-board').click();
  const board = page.getByTestId('border-board-screen');
  await board.getByTestId('border-board-checkpoint').click();
  await board.getByText(checkpoint.name, { exact: true }).click();
  await expect(board.getByText('TEST111', { exact: true })).toBeVisible();
  await board.getByTestId('border-board-next').click();
  await expect(board.getByText('TEST222', { exact: true })).toBeVisible();
  const search = board.getByTestId('border-board-search');
  await search.fill('TEST222');
  await search.press('Enter');
  await expect.poll(() => requests.at(-1)).toEqual({ checkpoint: checkpoint.id, plate: 'TEST222', page: '1' });
  await expect(board.getByText('TEST222', { exact: true })).toBeVisible();
  await expect(board.getByText('TEST111', { exact: true })).toHaveCount(0);
});
