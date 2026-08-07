const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PROD = 'https://urtruck.kz';
const EXPECTED_COMMIT = process.env.PRODUCTION_EXPECTED_COMMIT;

async function expectHealthy(response, label) {
  expect(response.status(), `${label} returned server error`).toBeLessThan(500);
  return response;
}

test('production serves the merged build and public critical APIs', async ({ request }) => {
  expect(EXPECTED_COMMIT).toMatch(/^[0-9a-f]{40}$/);

  const build = await expectHealthy(await request.get(`${PROD}/build-info.json`), 'build-info');
  expect(build.status()).toBe(200);
  const buildInfo = await build.json();
  expect(buildInfo.commit).toBe(EXPECTED_COMMIT);

  const root = await expectHealthy(await request.get(`${PROD}/`), 'frontend');
  expect(root.status()).toBe(200);
  expect(await root.text()).toMatch(/<html|<!doctype/i);

  const system = await expectHealthy(
    await request.get(`${PROD}/security/api/v1/system/info`),
    'system info',
  );
  expect(system.status()).toBe(200);
  expect(await system.json()).toHaveProperty('otp');

  for (const collection of ['cargos', 'trips']) {
    const response = await expectHealthy(
      await request.get(`${PROD}/security/api/v1/market/${collection}?status=active&limit=1`),
      `market ${collection}`,
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty(collection);
  }

  const publicKey = await expectHealthy(
    await request.get(`${PROD}/security/api/v1/push/public-key`),
    'push public key',
  );
  expect(publicKey.status()).toBe(200);
  expect(await publicKey.json()).toHaveProperty('public_key');

  const sw = await expectHealthy(await request.get(`${PROD}/sw.js?qa=${Date.now()}`), 'service worker');
  expect(sw.status()).toBe(200);
  const swSource = await sw.text();
  expect(swSource).toContain("addEventListener('notificationclick'");
  expect(swSource).toContain('postMessage');
  expect(swSource).toContain('openWindow');
});

test('production auth, deals, chat, documents and favorites routes are live and guarded', async ({ request }) => {
  const routes = [
    ['auth session', '/security/api/v1/register/me'],
    ['deals', '/security/api/v1/market/deals'],
    ['chat', '/security/api/v1/chat/unread'],
    ['documents', '/security/api/v1/market/deals/qa-production-smoke/waybill'],
    ['favorites', '/security/api/v1/favorites'],
  ];

  for (const [label, path] of routes) {
    const response = await expectHealthy(await request.get(`${PROD}${path}`), label);
    expect(response.status(), `${label} route is missing`).not.toBe(404);
    expect([200, 401, 403, 422], `${label} returned unexpected status`).toContain(response.status());
  }
});

test('production onboarding renders and reaches both auth channels', async ({ page }) => {
  fs.mkdirSync('qa-artifacts/production-smoke', { recursive: true });
  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const start = page.getByTestId('onb-v2-cta-phone');
  await expect(start).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'qa-artifacts/production-smoke/01-live-onboarding.png', fullPage: true });

  await start.click();
  await expect(page.getByTestId('email-v2-input')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('auth-tab-phone')).toBeVisible();
  await page.getByTestId('auth-tab-phone').click();
  await expect(page.getByTestId('phone-v2-input')).toHaveAttribute('inputmode', 'tel');
  await page.screenshot({ path: 'qa-artifacts/production-smoke/02-live-auth-channels.png', fullPage: true });
});
