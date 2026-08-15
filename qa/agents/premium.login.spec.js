// Регрессия действующего единого входа: OnboardingV2 → PhoneV2 → OtpV2.
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, requestOtp, submitOtp, tid } = require('../utils/onboardingV2');

test('login v2 · onboarding открывает единый email/phone вход', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await expect(page.locator(tid('onb-v2-cta-phone'))).toBeVisible();
  await page.locator(tid('onb-v2-cta-phone')).click();
  await expect(page.locator(tid('auth-tab-email'))).toBeVisible();
  await expect(page.locator(tid('auth-tab-phone'))).toBeVisible();
  await expect(page.locator(tid('email-v2-input'))).toBeVisible();
  await expect(page.locator(tid('prem-login-screen'))).toHaveCount(0);
});

test('login v2 · returning driver сохраняет сессию после reload', async ({ page }) => {
  await freshOnboarding(page, BASE_URL, { role: 'driver' });
  await requestOtp(page);
  await submitOtp(page);
  await expect(page.locator(tid('bottom-nav'))).toBeVisible({ timeout: 15000 });
  const token = await page.evaluate(() => localStorage.getItem('ur_reg_token'));
  expect(token).toBe('qa-onboarding-driver-token');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(tid('bottom-nav'))).toBeVisible({ timeout: 15000 });
  await expect(page.locator(tid('onb-v2-cta-phone'))).toHaveCount(0);
});

test('login v2 · очистка сессии возвращает на OnboardingV2', async ({ page }) => {
  await freshOnboarding(page, BASE_URL, { role: 'driver' });
  await requestOtp(page);
  await submitOtp(page);
  await expect(page.locator(tid('bottom-nav'))).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(tid('onb-v2-cta-phone'))).toBeVisible({ timeout: 15000 });
});
