// Сквозная регрессия регистрации через актуальный OnboardingV2.
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, requestOtp, submitOtp, chooseRoleAndReachMain, tid } = require('../utils/onboardingV2');

for (const role of ['driver', 'client']) {
  test(`auth v2 · новый ${role} выбирает роль и достигает главного экрана`, async ({ page }) => {
    await freshOnboarding(page, BASE_URL);
    await requestOtp(page, { email: `new-${role}@example.com` });
    await submitOtp(page);
    await chooseRoleAndReachMain(page, role);
    await expect(page.locator(tid(`bottom-nav-${role === 'driver' ? 'feed' : 'mywork'}`))).toBeVisible();
  });
}

test('auth v2 · неверный OTP не открывает выбор роли', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await requestOtp(page);
  await page.unroute('**/api/v1/register/email/verify');
  await page.route('**/api/v1/register/email/verify', (route) => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"detail":"invalid_code"}',
  }));
  await page.locator(tid('otp-v2-input')).fill('1357');
  await expect(page.locator(tid('otp-v2-screen'))).toBeVisible();
  await expect(page.locator(tid('role-v2-screen'))).toHaveCount(0);
});
