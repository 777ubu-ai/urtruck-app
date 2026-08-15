// Гостевой путь начинается в OnboardingV2, не в удалённом RoleScreen.
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, tid } = require('../utils/onboardingV2');

async function openGuest(page) {
  await page.route('**/api/v1/register/guest', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"token":"guest-onboarding-v2","verification_level":0}',
  }));
  await page.route('**/api/v1/market/cargos*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"cargos":[],"total":0}',
  }));
  await page.locator(tid('onb-v2-cta-guest')).click();
  await expect(page.locator(tid('bottom-nav'))).toBeVisible({ timeout: 15000 });
  // Гость попадает на «Мои грузы» (client default); лента машин доступна
  // отдельной реальной вкладкой и содержит переключатель языка.
  await page.locator(tid('bottom-nav-feed')).click();
  await expect(page.locator(tid('feed-lang-switch'))).toBeVisible({ timeout: 10000 });
}

test('guest v2 · onboarding показывает безопасный вход в просмотр грузов', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await expect(page.locator(tid('onb-v2-cta-guest'))).toBeVisible();
  await expect(page.locator(tid('role-browse-guest'))).toHaveCount(0);
  await openGuest(page);
  await expect(page.locator(tid('feed-lang-switch'))).toBeVisible();
});

test('guest v2 · язык доступен после гостевого входа', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await openGuest(page);
  await page.locator(tid('feed-lang-switch')).click();
  await expect(page.locator(tid('lang-en'))).toBeVisible();
  await page.locator(tid('lang-en')).click();
  expect(await page.evaluate(() => localStorage.getItem('ur_lang'))).toBe('EN');
});
