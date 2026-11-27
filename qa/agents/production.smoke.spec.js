const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PROD = 'https://urtruck.kz';
const AUDIT_BASE = (process.env.QA_BASE_URL || process.env.E2E_BASE_URL || '').replace(/\/$/, '');
const EXPECTED_LOCAL_COMMIT = process.env.LOCAL_BUILD_EXPECTED_COMMIT || process.env.GITHUB_SHA || '';
const POST_DEPLOY = process.env.PRODUCTION_POST_DEPLOY === '1';

async function expectHealthy(response, label) {
  expect(response.status(), `${label} returned server error`).toBeLessThan(500);
  return response;
}

test('PR audit serves the local or preview build artifact', async ({ request }) => {
  test.skip(!AUDIT_BASE, 'deployed production build-info is verified only by the production deploy workflow');

  const build = await expectHealthy(await request.get(`${AUDIT_BASE}/build-info.json`), 'local build-info');
  expect(build.status()).toBe(200);
  const buildInfo = await build.json();
  expect(buildInfo.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(buildInfo.short).toBe(buildInfo.commit.slice(0, 7));
  expect(buildInfo.version).toBeDefined();
  if (EXPECTED_LOCAL_COMMIT) expect(buildInfo.commit).toBe(EXPECTED_LOCAL_COMMIT);

  const root = await expectHealthy(await request.get(`${AUDIT_BASE}/`), 'frontend');
  expect(root.status()).toBe(200);
  expect(await root.text()).toMatch(/<html|<!doctype/i);
});

test('production public critical APIs remain available', async ({ request }) => {
  test.skip(!POST_DEPLOY, 'production API proof runs only after the production deploy workflow succeeds');

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
  test.skip(!POST_DEPLOY, 'production route proof runs only after the production deploy workflow succeeds');

  // This suite intentionally validates the ALREADY DEPLOYED current main.
  // PR-only endpoints belong in local PR tests; requiring them from production
  // before merge would make every feature PR false-red by construction.
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
    expect([200, 401, 403, 405, 422], `${label} returned unexpected status`).toContain(response.status());
  }
});

test('production store landing exposes both current app store links', async ({ page }) => {
  fs.mkdirSync('qa-artifacts/production-smoke', { recursive: true });
  const response = await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 60000 });
  expect(response?.status()).toBe(200);
  const android = page.locator('[data-store-link="android"]');
  const ios = page.locator('[data-store-link="ios"]');
  await expect(android).toBeVisible({ timeout: 30000 });
  await expect(android).toHaveAttribute('href', /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.urtruck\.app$/);
  await expect(ios).toBeVisible({ timeout: 30000 });
  await expect(ios).toHaveAttribute('href', /^https:\/\/apps\.apple\.com\/kz\/app\/urtruck\/id\d+$/);
  await page.screenshot({ path: 'qa-artifacts/production-smoke/01-live-store-landing.png', fullPage: true });
});
