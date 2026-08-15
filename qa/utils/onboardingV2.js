const { expect } = require('@playwright/test');

const tid = (id) => `[data-testid="${id}"]`;
const OTP = '0000';

async function installOnboardingMock(page, { role = null } = {}) {
  const token = `qa-onboarding-${role || 'new'}-token`;
  const verifyBody = {
    token,
    verification_level: 1,
    role,
    beta: true,
  };
  const meBody = {
    id: `qa-onboarding-${role || 'new'}`,
    phone: '+77479171118',
    email: 'qa-onboarding@example.com',
    verification_level: 1,
    role,
  };

  await page.route('**/api/v1/register/email/send', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sent: true, mock: true, beta: true, code: OTP }),
  }));
  await page.route('**/api/v1/register/whatsapp/send', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sent: true, mock: true, beta: true, code: OTP }),
  }));
  await page.route('**/api/v1/register/email/verify', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(verifyBody),
  }));
  await page.route('**/api/v1/register/whatsapp/verify', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(verifyBody),
  }));
  await page.route('**/api/v1/register/me', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(meBody),
  }));
  await page.route('**/api/v1/users/me', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: meBody.id, name: 'QA Onboarding', city: 'Алматы' }),
  }));
  await page.route('**/api/v1/notifications/unread', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"items":[],"count":0}',
  }));
}

async function freshOnboarding(page, baseUrl, options = {}) {
  await installOnboardingMock(page, options);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(tid('onb-v2-cta-phone'))).toBeVisible({ timeout: 15000 });
}

async function openPhone(page, mode = 'email') {
  await page.locator(tid('onb-v2-cta-phone')).click();
  await expect(page.locator(tid(`auth-tab-${mode}`))).toBeVisible({ timeout: 10000 });
  await page.locator(tid(`auth-tab-${mode}`)).click();
}

async function requestOtp(page, { mode = 'email', email = 'qa-onboarding@example.com', phone = '7479171118' } = {}) {
  await openPhone(page, mode);
  const input = page.locator(tid(mode === 'email' ? 'email-v2-input' : 'phone-v2-input'));
  await input.fill(mode === 'email' ? email : phone);
  await expect(page.locator(tid('phone-v2-cta'))).toBeEnabled();
  await page.locator(tid('phone-v2-cta')).click();
  await expect(page.locator(tid('otp-v2-screen'))).toBeVisible({ timeout: 10000 });
}

async function submitOtp(page) {
  await page.locator(tid('otp-v2-cells')).click();
  await page.locator(tid('otp-v2-input')).fill(OTP);
}

async function chooseRoleAndReachMain(page, role) {
  await expect(page.locator(tid('role-v2-screen'))).toBeVisible({ timeout: 15000 });
  await page.locator(tid(role === 'driver' ? 'role-v2-driver' : 'role-v2-client')).click();
  await expect(page.locator(tid('role-v2-cta'))).toBeEnabled();
  await page.locator(tid('role-v2-cta')).click();

  const profile = page.locator(tid('profile-v2-screen'));
  const nav = page.locator(tid('bottom-nav'));
  await Promise.race([
    profile.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
  ]);
  if (await profile.isVisible().catch(() => false)) {
    await profile.locator(tid('profile-v2-name')).fill('QA Onboarding');
    await profile.locator(tid('profile-v2-city')).fill('Алматы');
    await profile.locator(tid('profile-v2-cta')).click();
  }
  await expect(nav).toBeVisible({ timeout: 15000 });
}

module.exports = {
  OTP,
  tid,
  installOnboardingMock,
  freshOnboarding,
  openPhone,
  requestOtp,
  submitOtp,
  chooseRoleAndReachMain,
};
