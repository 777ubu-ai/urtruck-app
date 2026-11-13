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

async function expectStoreLandingOnly(page) {
  await expect(page.getByRole('heading', { name: 'UrTruck' })).toBeVisible();
  await expect(page.locator('[data-store-link="android"]')).toBeVisible();
  await expect(page.locator('[data-store-link="ios"]')).toBeVisible();
  await expect(page.locator('#root')).toHaveCount(0);
  await expect(page.locator('[data-testid="onb-v2-cta-phone"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="email-v2-input"]')).toHaveCount(0);
}

test('ordinary visitor and URL-only fake callback stay on the store landing', async ({ page }) => {
  await page.goto(BASE);
  await expectStoreLandingOnly(page);
  await page.goto(`${BASE}/?code=fake&state=fake`);
  await expectStoreLandingOnly(page);
  await page.goto(`${BASE}/?social_auth=1&code=fake&state=fake`);
  await expectStoreLandingOnly(page);
});

test('invalid and cancelled callback never reveal web registration', async ({ page }) => {
  await page.goto(`${BASE}/?social_auth=1&error=access_denied&error_description=cancelled`);
  await expectStoreLandingOnly(page);
  await page.goto(`${BASE}/?social_auth=1&token_hash=fake&type=recovery`);
  await expectStoreLandingOnly(page);
});

test('failed initiated OAuth callback returns to the store landing after processing', async ({ page }) => {
  let rejectTokenResponse;
  const tokenResponse = new Promise((resolve) => { rejectTokenResponse = resolve; });
  await page.addInitScript(() => {
    localStorage.setItem('ur_social_pending_provider', JSON.stringify({ provider: 'google', startedAt: Date.now() }));
  });
  await page.route('https://pymddxenwtjcbmrafvnc.supabase.co/auth/v1/token**', async (route) => {
    await tokenResponse;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'expired authorization code' }),
    });
  });
  await page.goto(`${BASE}/?social_auth=1&code=expired-code&state=provider-state`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#urtruck-oauth-pending')).toBeVisible();
  await expect(page.locator('#root')).toHaveCSS('visibility', 'hidden');
  rejectTokenResponse();
  await expect(page.locator('[data-store-link="android"]')).toBeVisible({ timeout: 30000 });
  await expectStoreLandingOnly(page);
});

async function completePublicOAuthCallback(page, { role, isNew }) {
  let completeSocialVerify;
  const socialVerifyResponse = new Promise((resolve) => { completeSocialVerify = resolve; });
  const apiRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) {
      apiRequests.push({ url: new URL(request.url()).pathname, method: request.method() });
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('ur_social_pending_provider', JSON.stringify({ provider: 'google', startedAt: Date.now() }));
    // Supabase PKCE requires the verifier saved by the legitimate OAuth start
    // before it will exchange a successful callback code.
    localStorage.setItem('sb-pymddxenwtjcbmrafvnc-auth-token-code-verifier', 'test-pkce-verifier');
  });
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('https://pymddxenwtjcbmrafvnc.supabase.co/auth/v1/token**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: 'supabase-test-access', refresh_token: 'supabase-test-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: 'supabase-user', email: 'callback@example.test', user_metadata: { full_name: 'Callback Tester' } },
    }),
  }));
  await page.route('**/api/v1/register/social/verify', async (route) => {
    await socialVerifyResponse;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'urtruck-callback-session', email: 'callback@example.test', user_id: 'callback-user',
        role, is_new: isNew, verification_level: 1,
      }),
    });
  });
  await page.goto(`${BASE}/?social_auth=1&code=valid-pkce-code`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#urtruck-oauth-pending')).toBeVisible();
  await expect(page.locator('#root')).toHaveCSS('visibility', 'hidden');
  completeSocialVerify();
  await expectStoreLandingOnly(page);
  await expect(page.locator('[data-testid="role-v2-screen"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="profile-v2-screen"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="bottom-nav"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('ur_reg_token')))).toBe(true);
  expect(apiRequests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
    .map(({ url }) => url)).toEqual(['/api/v1/register/social/verify']);
}

test('successful OAuth for a new account without role ends at stores, not web role registration', async ({ page }) => {
  await completePublicOAuthCallback(page, { role: null, isNew: true });
});

test('successful OAuth for existing driver and shipper accounts ends at stores without changing roles', async ({ browser }) => {
  for (const role of ['driver', 'client']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await completePublicOAuthCallback(page, { role, isNew: false });
    await context.close();
  }
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
