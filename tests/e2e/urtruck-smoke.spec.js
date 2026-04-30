const { test, expect } = require('@playwright/test');

const BASE = 'https://urtruck.kz/?v=playwright-smoke';

test('open app and check main screen', async ({ page }) => {
  const errors = [];

  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await expect(page.getByText('UrTruck')).toBeVisible({ timeout: 15000 });

  await page.screenshot({ path: 'tests/e2e/01-main.png', fullPage: true });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('driver flow opens feed', async ({ page }) => {
  const errors = [];

  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.getByText('Я водитель').click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'tests/e2e/02-driver-feed.png', fullPage: true });

  await expect(page.getByRole('tab', { name: /Грузы/ })).toBeVisible({ timeout: 15000 });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('click first cargo card does not crash', async ({ page }) => {
  const errors = [];

  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.getByText('Я водитель').click();
  await page.waitForTimeout(3000);

  const firstRoute = page.getByText(/Хоргос|Алматы|Астана|Шымкент|Москва|Пекин/).first();
  await expect(firstRoute).toBeVisible({ timeout: 15000 });

  await firstRoute.click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'tests/e2e/03-click-card.png', fullPage: true });

  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});
