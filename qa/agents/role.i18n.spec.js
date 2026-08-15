const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, requestOtp, submitOtp, tid } = require('../utils/onboardingV2');

test('RoleV2 · роли имеют понятные локализованные подписи и CTA', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await requestOtp(page);
  await submitOtp(page);
  await expect(page.locator(tid('role-v2-screen'))).toBeVisible({ timeout: 15000 });
  await expect(page.locator(tid('role-v2-driver'))).toContainText(/Водитель/i);
  await expect(page.locator(tid('role-v2-client'))).toContainText(/Грузовладелец/i);
  await expect(page.locator(tid('role-v2-cta'))).toBeDisabled();
});

test('язык сохраняется при гостевом входе и переключает актуальную ленту', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await page.route('**/api/v1/register/guest', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"token":"guest-v2","verification_level":0}' }));
  await page.locator(tid('onb-v2-cta-guest')).click();
  await expect(page.locator(tid('bottom-nav-feed'))).toBeVisible({ timeout: 15000 });
  await page.locator(tid('bottom-nav-feed')).click();
  await expect(page.locator(tid('feed-lang-switch'))).toBeVisible({ timeout: 15000 });
  await page.locator(tid('feed-lang-switch')).click();
  await page.locator(tid('lang-en')).click();
  // Компактный переключатель отображает флаг, а не ISO-код.
  await expect(page.locator(tid('feed-lang-switch'))).toContainText('🇬🇧');
  expect(await page.evaluate(() => localStorage.getItem('ur_lang'))).toBe('EN');
});
