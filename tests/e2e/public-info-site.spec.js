const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4178';
const evidenceDir = process.env.SITE_EVIDENCE_DIR;
const stores = {
  android: 'https://play.google.com/store/apps/details?id=com.urtruck.app',
  ios: 'https://apps.apple.com/kz/app/urtruck/id6764504167',
};

async function expectInformationSiteOnly(page) {
  await expect(page.getByRole('heading', { name: 'Найдите партнёра для следующего рейса.' })).toBeVisible();
  await expect(page.locator('[data-store-link="android"]')).toHaveAttribute('href', stores.android);
  await expect(page.locator('[data-store-link="ios"]')).toHaveAttribute('href', stores.ios);
  await expect(page.locator('#root, [data-testid="role-v2-screen"], [data-testid="profile-v2-screen"], [data-testid="onb-v2-cta-phone"], [data-testid="email-v2-input"]')).toHaveCount(0);
  await expect(page.locator('form, input')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Войти|Зарегистрироваться|Login|Sign up/i })).toHaveCount(0);
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/ИИН|\bIIN\b|Дата рождения|Date of birth/i);
}

test('desktop has information, real app screens, QR codes and both stores with no automatic navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await expectInformationSiteOnly(page);
  await expect(page.locator('[data-store-card="ios"] .store-platform')).toHaveText('IPHONE');
  expect(await page.locator('body').innerText()).not.toMatch(/\biPad(?:OS)?\b/i);
  await expect(page.getByRole('img', { name: 'QR-код официальной страницы UrTruck в Google Play' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR-код официальной страницы UrTruck в App Store' })).toBeVisible();
  await expect(page.locator('#app-screenshot')).toHaveAttribute('src', '/site/assets/cargo-feed.png');
  await expect(page.getByRole('link', { name: 'support@urtruck.kz' })).toBeVisible();
  await page.waitForTimeout(700);
  expect(page.url()).toBe(`${BASE}/`);
  if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, 'desktop-1440.png'), fullPage: true });
});

test('mobile Android and iPhone highlight the matching store, keep both links and wait for user action', async ({ browser }) => {
  for (const [name, ua, platform, expected] of [
    ['android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', 'Linux armv8l', 'android'],
    ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 'iPhone', 'ios'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript((platformValue) => Object.defineProperty(navigator, 'platform', { configurable: true, get: () => platformValue }), platform);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expectInformationSiteOnly(page);
    await expect(page.locator(`[data-store-card="${expected}"]`)).toHaveClass(/is-primary/);
    await expect(page.locator('[data-store-link="android"]')).toBeVisible();
    await expect(page.locator('[data-store-link="ios"]')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    await page.waitForTimeout(700);
    expect(page.url()).toBe(`${BASE}/`);
    if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `${name}-390x844.png`), fullPage: true });
    await context.close();
  }
});

test('language selector changes all key site sections for RU, KK, EN and ZH', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  for (const [language, title, download] of [
    ['ru', 'Найдите партнёра для следующего рейса.', 'Продолжите в приложении UrTruck'],
    ['kk', 'Келесі рейске серіктес табыңыз.', 'UrTruck қосымшасында жалғастырыңыз'],
    ['en', 'Find a partner for your next trip.', 'Continue in the UrTruck app'],
    ['zh', '为下一趟运输找到合作伙伴。', '在 UrTruck 应用中继续'],
  ]) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('#download h2')).toHaveText(download);
    await expect(page.locator('#support h2')).not.toBeEmpty();
    expect(await page.locator('body').innerText()).not.toMatch(/\biPad(?:OS)?\b/i);
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  }
});

test('mobile text-scale 130 percent keeps all information and actions within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); // Xiaomi 720 px / density 2
  await page.goto(BASE, { waitUntil: 'networkidle' });

  for (const language of ['ru', 'kk', 'en', 'zh']) {
    await page.locator('#language-select').selectOption(language);
    await page.evaluate(() => {
      // Stress the layout like Android's enlarged text setting while keeping
      // the 360 CSS-pixel viewport fixed (rather than zooming the page).
      for (const element of document.querySelectorAll('h1,h2,h3,p,a,button,select,span,label')) {
        if (element.closest('.visually-hidden')) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        element.dataset.qaBaseFontSize = style.fontSize;
        element.style.setProperty('font-size', `${parseFloat(style.fontSize) * 1.3}px`, 'important');
      }
    });

    const result = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const pageWidth = document.documentElement.scrollWidth;
      const outside = [...document.querySelectorAll('h1,h2,h3,p,a,button,select,span,label')]
        .filter((element) => !element.closest('.visually-hidden') && element.tagName !== 'SELECT' && !element.querySelector('select'))
        .flatMap((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return [...range.getClientRects()].map((rect) => ({
            text: (element.innerText || '').trim().slice(0, 48),
            left: rect.left,
            right: rect.right,
            viewportWidth,
          })).filter((rect) => rect.right > viewportWidth + 1 || rect.left < -1);
        });
      const horizontalScrollers = [...document.querySelectorAll('body *')]
        .filter((element) => !element.closest('.visually-hidden'))
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.className?.toString() || element.tagName);
      return { viewportWidth, pageWidth, outside, horizontalScrollers };
    });

    expect(result.pageWidth, `${language}: document width`).toBeLessThanOrEqual(result.viewportWidth);
    expect(result.outside, `${language}: text outside viewport`).toEqual([]);
    expect(result.horizontalScrollers, `${language}: clipped or horizontally scrolling content`).toEqual([]);
    for (const action of await page.locator('.role-card .role-link').all()) {
      await action.scrollIntoViewIfNeeded();
      const hitTest = await action.evaluate((link) => {
        const rect = link.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight,
          receivesPointer: Boolean(hit && link.contains(hit)),
        };
      });
      expect(hitTest, `${language}: role action must be visible and receive taps`).toEqual({
        visible: true,
        receivesPointer: true,
      });
    }
    await expect(page.locator('[data-store-link="android"]')).toBeVisible();
    await expect(page.locator('[data-store-link="ios"]')).toBeVisible();
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('[data-qa-base-font-size]')) {
        element.style.removeProperty('font-size');
        delete element.dataset.qaBaseFontSize;
      }
    });
  }
});

test('fake, cancelled and successful public OAuth callbacks stay informational and scrub secrets', async ({ page }) => {
  for (const callback of [
    '/?code=fake&state=fake',
    '/?social_auth=1&error=access_denied&error_description=cancelled',
    '/?social_auth=1&code=provider-code&state=provider-state',
  ]) {
    await page.goto(`${BASE}${callback}`, { waitUntil: 'networkidle' });
    await expectInformationSiteOnly(page);
    await expect(page.locator('#callback-notice')).toBeVisible();
    expect(page.url()).not.toMatch(/code=|state=|social_auth=|access_token=|refresh_token=/);
  }
  // Email confirmation/recovery query forms are not reinterpreted as social
  // callbacks by this public landing; current provider/API handling remains.
  await page.goto(`${BASE}/?token_hash=preserve-for-existing-handler&type=recovery`);
  await expectInformationSiteOnly(page);
  expect(page.url()).toContain('token_hash=preserve-for-existing-handler');
});

test('old web screens route to the information site, while app-link and service paths remain separate', async ({ page, request }) => {
  for (const oldPath of ['/register', '/login', '/signup', '/profile', '/dashboard', '/my-work', '/my-trips', '/deals', '/chat']) {
    const response = await request.get(`${BASE}${oldPath}`, { maxRedirects: 0 });
    expect(response.status(), oldPath).toBe(302);
    expect(response.headers().location, oldPath).toBe('/');
  }
  for (const pathName of ['/cargos/42', '/trips/42', '/driver/42', '/notifications/42']) {
    await page.goto(`${BASE}${pathName}`);
    await expectInformationSiteOnly(page);
  }
  const aasa = await request.get(`${BASE}/.well-known/apple-app-site-association`);
  expect(aasa.ok()).toBeTruthy();
  expect((await aasa.json()).applinks.details[0].paths).toContain('/cargos/*');
  const assetLinks = await request.get(`${BASE}/.well-known/assetlinks.json`);
  expect(assetLinks.ok()).toBeTruthy();
  expect((await assetLinks.json())[0].target.package_name).toBe('com.urtruck.app');
  const api = await request.get(`${BASE}/api/v1/register/me`);
  expect(api.status()).toBe(501); // Preview sentinel: production nginx must keep the existing API proxy.
  expect((await api.json()).preview).toBe(true);
  const terms = await request.get(`${BASE}/terms`);
  expect(terms.ok()).toBeTruthy();
  expect(terms.headers()['content-type']).toContain('text/html');
});

test('public-site service worker is active and browser storage survives normal reload', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    localStorage.setItem('urtruck-existing-user-data-sentinel', 'preserve');
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active))).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('urtruck-existing-user-data-sentinel'))).toBe('preserve');
  await expectInformationSiteOnly(page);
  const worker = fs.readFileSync(path.join(process.cwd(), 'public-site/sw.js'), 'utf8');
  expect(worker).toContain("self.addEventListener('push'");
  expect(worker).toContain("self.addEventListener('notificationclick'");
  expect(worker).not.toContain("caches.match(request)");
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, 'tablet-768x1024.png'), fullPage: true });
});
