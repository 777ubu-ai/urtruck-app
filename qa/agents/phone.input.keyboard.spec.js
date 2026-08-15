const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, openPhone, tid } = require('../utils/onboardingV2');

test('phone v2 · input имеет телефонные hints и валидирует номер', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await openPhone(page, 'phone');
  const input = page.locator(tid('phone-v2-input'));
  await expect(input).toBeVisible();
  // react-native-web превращает inputMode="tel" в нативный type="tel".
  // Именно type=tel заставляет браузер открыть цифровую телефонную клавиатуру.
  expect(await input.getAttribute('type')).toBe('tel');
  expect(await input.getAttribute('autocomplete')).toContain('tel');
  await input.fill('7479171118');
  await expect(page.locator(tid('phone-v2-cta'))).toBeEnabled();
});

test('phone v2 · email и телефон используют один OTP экран', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await openPhone(page, 'email');
  await page.locator(tid('email-v2-input')).fill('qa@example.com');
  await page.locator(tid('phone-v2-cta')).click();
  await expect(page.locator(tid('otp-v2-screen'))).toBeVisible();
});
