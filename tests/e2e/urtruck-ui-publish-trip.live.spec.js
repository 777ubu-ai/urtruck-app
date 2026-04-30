const { test, expect } = require('@playwright/test');

const LIVE = process.env.RUN_LIVE_TESTS === '1';
const BASE = 'https://urtruck.kz/?v=playwright-trip-testid';

test('UI: driver opens publish trip form and submits without crash', async ({ page }) => {
  test.skip(!LIVE, 'Live tests disabled. Set RUN_LIVE_TESTS=1 to run against production.');
  console.log('⚠️ RUNNING LIVE TEST: this creates real data in production');
  const errors = [];
  const stamp = Date.now();

  const FROM = `QA Откуда ${stamp}`;
  const TO = `QA Куда ${stamp}`;

  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.getByText('Я водитель').click();
  await page.waitForTimeout(2500);

  await page.getByTestId('publish-trip-button').click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'tests/e2e/11-trip-form-open.png', fullPage: true });

  await page.getByTestId('trip-from-input').fill(FROM);
  await page.getByTestId('trip-to-input').fill(TO);

  const transit = page.getByTestId('trip-transit-input');
  if (await transit.count()) {
    await transit.fill('Казахстан');
  }

  const dates = page.locator('input[type="date"]');
  const dateCount = await dates.count();
  if (dateCount > 0) await dates.nth(0).fill('2026-05-10');
  if (dateCount > 1) await dates.nth(1).fill('2026-05-12');

  const numbers = page.locator('input[type="number"]');
  const numberCount = await numbers.count();
  if (numberCount > 0) await numbers.nth(0).fill('22');
  if (numberCount > 1) await numbers.nth(1).fill('90');
  if (numberCount > 2) await numbers.nth(2).fill('0');

  await page.screenshot({ path: 'tests/e2e/12-trip-form-filled.png', fullPage: true });

  await page.getByTestId('trip-submit-button').click();

  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tests/e2e/13-trip-after-submit.png', fullPage: true });

  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});
