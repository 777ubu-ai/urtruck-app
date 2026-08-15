// Скриншоты действующих экранов OnboardingV2 на целевых desktop/mobile viewport.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { BASE_URL } = require('../utils/qaConfig');
const { freshOnboarding, requestOtp, submitOtp, tid } = require('../utils/onboardingV2');

const OUT = path.resolve(__dirname, '..', 'screenshots', 'onboarding-v2');
const viewports = [
  ['desktop', 1280, 900], ['iphone-13', 390, 844], ['iphone-se', 320, 568],
];

for (const [name, width, height] of viewports) {
  test(`visual · ${name} · onboarding v2, auth и выбор роли`, async ({ page }) => {
    fs.mkdirSync(path.join(OUT, name), { recursive: true });
    await page.setViewportSize({ width, height });
    await freshOnboarding(page, BASE_URL);
    await expect(page.locator(tid('onb-v2-cta-phone'))).toBeVisible();
    await page.screenshot({ path: path.join(OUT, name, '01-onboarding-v2.png'), fullPage: true });
    await requestOtp(page, { email: `visual-${name}@example.com` });
    await expect(page.locator(tid('otp-v2-screen'))).toBeVisible();
    await page.screenshot({ path: path.join(OUT, name, '02-otp-v2.png'), fullPage: true });
    await submitOtp(page);
    await expect(page.locator(tid('role-v2-screen'))).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, name, '03-role-v2.png'), fullPage: true });
  });
}
