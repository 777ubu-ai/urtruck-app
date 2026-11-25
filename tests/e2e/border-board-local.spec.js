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
      range_start: current,
      range_end: current,
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
  await expect(board.getByTestId('border-board-range')).toHaveText('1–1 из 2');
  await board.getByTestId('border-board-next').click();
  await expect(board.getByTestId('border-board-range')).toHaveText('2–2 из 2');
  await expect(board.getByText('TEST222', { exact: true })).toBeVisible();
  const search = board.getByTestId('border-board-search');
  await search.fill('TEST222');
  await search.press('Enter');
  await expect.poll(() => requests.at(-1)).toEqual({ checkpoint: checkpoint.id, plate: 'TEST222', page: '1' });
  await expect(board.getByText('TEST222', { exact: true })).toBeVisible();
  await expect(board.getByText('TEST111', { exact: true })).toHaveCount(0);
});

test('filters the full board and distinguishes zero from source failure', async ({ page }) => {
  const checkpoint = { id: 'kalzhat', name: 'Калжат - Дулаты', name_ru: 'Калжат - Дулаты', country: 'CN' };
  const statuses = [
    { code: 'Pending', label: 'В очереди' },
    { code: 'Called', label: 'Вызван на пункт пропуска' },
    { code: 'Revoked', label: 'Пропуск отозван' },
  ];
  const requests = [];
  let unavailable = false;
  await page.route('**/borders/catalog', route => route.fulfill({
    json: { checkpoints: [checkpoint], countries: [{ country: 'CN' }] },
  }));
  await page.route('**/borders/online-board?*', route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push({ statuses: params.getAll('statuses'), plate: params.get('plate'), page: params.get('page') });
    if (unavailable) return route.fulfill({ status: 502, json: { detail: 'Source unavailable' } });
    const rows = params.get('plate') ? [] : [
      { plate: 'QA0001', checkpoint: checkpoint.name, date: '25.11.2026', slot: '08:00–09:00', status: 'В очереди' },
    ];
    return route.fulfill({ json: { rows, statuses, total: rows.length, page: 1, has_next: false, updated_at: '2026-11-25T12:00:00Z' } });
  });

  await H.emailLogin(page, 'board-filter-' + Date.now() + '@urtruck.kz', 'driver');
  await page.locator(H.tid('bottom-nav-queue')).click();
  await page.getByTestId('border-tab-board').click();
  const board = page.getByTestId('border-board-screen');
  await board.getByTestId('border-board-checkpoint').click();
  await board.getByText(checkpoint.name, { exact: true }).click();
  await expect(board.getByText('QA0001', { exact: true })).toBeVisible();

  await board.getByTestId('border-board-statuses').click();
  await board.getByRole('checkbox', { name: 'Пропуск отозван' }).click();
  await board.getByTestId('border-board-apply').click();
  await expect.poll(() => requests.at(-1)).toEqual({ statuses: ['Pending', 'Called'], plate: '', page: '1' });

  unavailable = true;
  await board.getByRole('button', { name: 'Обновить' }).click();
  await expect(board.getByText('Не удалось получить данные CGR. Повторите.')).toBeVisible();
  await expect(board.getByText('QA0001', { exact: true })).toBeVisible();
  await expect(board.getByText('По этим фильтрам записей нет')).toHaveCount(0);

  unavailable = false;
  const search = board.getByTestId('border-board-search');
  await search.fill('MISSING0001');
  await search.press('Enter');
  await expect.poll(() => requests.at(-1)).toEqual({ statuses: ['Pending', 'Called'], plate: 'MISSING0001', page: '1' });
  await expect(board.getByText('По этим фильтрам записей нет')).toBeVisible();
  await expect(board.getByText('QA0001', { exact: true })).toHaveCount(0);
});

test('saves and removes a checked plate across reloads without adding a vehicle', async ({ page }) => {
  const plate = 'TEST7777';
  await page.route('**/borders/lookup?*', route => route.fulfill({
    json: { success: true, found: false, plate },
  }));
  await H.emailLogin(page, 'board-save-' + Date.now() + '@urtruck.kz', 'driver');
  const openBorder = () => page.locator(H.tid('bottom-nav-queue')).click();
  await openBorder();
  const lookup = page.getByTestId('border-plate-search');
  await expect(lookup.getByText('Поиск по госномеру', { exact: true })).toHaveCount(1);
  await expect(lookup.getByTestId('border-plate-check')).toHaveText('Найти');
  const input = page.getByTestId('border-plate-input');
  await input.fill(plate);
  await page.getByTestId('border-plate-check').click();
  const tracked = page.getByTestId('border-tracked-plates');
  await expect(tracked).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить номер' }).click();
  await expect(tracked.getByText(plate, { exact: true })).toBeVisible();
  await expect(page.getByTestId('border-driver-vehicle-card').getByText(plate, { exact: true })).toHaveCount(0);
  await page.reload();
  await openBorder();
  await expect(tracked.getByText(plate, { exact: true })).toBeVisible();
  await tracked.getByRole('button', { name: 'Убрать сохранённый номер' }).click();
  await expect(tracked).toHaveCount(0);
  await page.reload();
  await openBorder();
  await expect(page.getByTestId('border-plate-input')).toBeVisible();
  await expect(tracked).toHaveCount(0);
});
