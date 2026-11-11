const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

test('desktop public landing offers both official stores and both local QR codes', async ({ page }) => {
  await page.goto(BASE);

  await expect(page.getByRole('heading', { name: 'UrTruck' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть Google Play' })).toHaveAttribute(
    'href', 'https://play.google.com/store/apps/details?id=com.urtruck.app',
  );
  await expect(page.getByRole('link', { name: 'Открыть App Store' })).toHaveAttribute(
    'href', 'https://apps.apple.com/kz/app/urtruck/id6764504167',
  );
  await expect(page.getByRole('img', { name: 'QR-код страницы UrTruck в Google Play' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR-код страницы UrTruck в App Store' })).toBeVisible();
});

test('mobile in-app browser retains a visible store button when automatic handoff is deferred', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => (
      delay === 450 ? nativeSetTimeout(callback, 60_000, ...args) : nativeSetTimeout(callback, delay, ...args)
    );
  });
  await page.goto(`${BASE}/?utm_source=embedded-browser`);

  await expect(page.locator('html')).toHaveAttribute('data-urtruck-platform', 'android');
  await expect(page.locator('[data-store-link="android"]')).toBeVisible();
  await expect(page.locator('[data-store-link="ios"]')).toBeVisible();
  await expect(page.getByText('Установку приложения подтвердите в магазине.')).toBeVisible();
  await context.close();
});

test('OAuth callback restores the app shell instead of redirecting into a store', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(`${BASE}/?social_auth=1&code=mock-code&state=mock-state`);

  await expect(page.locator('#root')).toHaveCount(1);
  await expect(page.locator('main .stores')).toHaveCount(0);
});

async function assertLegacyStoreFallback(page, path) {
  const index = fs.readFileSync('dist/index.html', 'utf8');
  await page.route(new RegExp(`${path}$`), (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: index,
  }));
  await page.goto(`${BASE}${path}`);
  await expect(page.locator('[data-store-link="android"]')).toBeVisible();
  await expect(page.locator('[data-store-link="ios"]')).toBeVisible();
}

test('legacy registration URL renders the install page', async ({ page }) => {
  await assertLegacyStoreFallback(page, '/register');
});

test('legacy profile URL renders the install page', async ({ page }) => {
  await assertLegacyStoreFallback(page, '/profile');
});
