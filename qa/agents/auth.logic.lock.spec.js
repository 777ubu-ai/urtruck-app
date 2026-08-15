// Контракт навигации единого auth-потока. Не допускает возврата RoleScreen.
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, requestOtp, submitOtp, tid } = require('../utils/onboardingV2');

test('auth lock · landing ведёт только в OnboardingV2 и PhoneV2', async ({ page }) => {
  await freshOnboarding(page, BASE_URL);
  await expect(page.locator(tid('role-driver'))).toHaveCount(0);
  await expect(page.locator(tid('role-login'))).toHaveCount(0);
  await page.locator(tid('onb-v2-cta-phone')).click();
  await expect(page.locator(tid('email-v2-input'))).toBeVisible();
  await expect(page.locator(tid('phone-v2-cta'))).toBeDisabled();
});

for (const role of ['driver', 'client']) {
  test(`auth lock · ${role} выбирается на RoleV2 только после OTP`, async ({ page }) => {
    await freshOnboarding(page, BASE_URL);
    await requestOtp(page, { email: `lock-${role}@example.com` });
    await submitOtp(page);
    await expect(page.locator(tid('role-v2-screen'))).toBeVisible({ timeout: 15000 });
    await expect(page.locator(tid('role-v2-cta'))).toBeDisabled();
    await page.locator(tid(`role-v2-${role === 'client' ? 'client' : 'driver'}`)).click();
    await expect(page.locator(tid('role-v2-cta'))).toBeEnabled();
  });
}
