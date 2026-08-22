const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { BASE_URL } = require('../utils/qaConfig');

const shotDir = path.resolve(__dirname, '../../qa-artifacts/onboarding-v2');

async function mockBaseApi(page, { returningRole = null } = {}) {
  await page.route('**/api/v1/register/email/send', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sent: true, mock: true, code: '0000', channel: 'email' }),
  }));
  await page.route('**/api/v1/register/email/verify', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token: 'qa-onboarding-v2-token',
      verification_level: 1,
      role: returningRole,
      is_new: !returningRole,
    }),
  }));
  await page.route('**/api/v1/register/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'qa-onboarding-v2-user',
      email: 'qa-onboarding-v2@urtruck.kz',
      phone: null,
      role: returningRole || 'guest',
      verification_level: 1,
      full_name: returningRole ? 'QA Returning User' : null,
    }),
  }));
  await page.route('**/api/v1/users/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ name: 'QA Returning User', city: 'Алматы' }),
  }));
  await page.route('**/api/v1/push/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{}',
  }));
  await page.route('**/api/v1/notifications/unread**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], count: 0 }),
  }));
  await page.route('**/api/v1/chat/unread**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ count: 0, threads: [] }),
  }));
  await page.route('**/api/v1/market/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], trips: [], cargos: [] }),
  }));
}

async function freshOnboarding(page, options) {
  await mockBaseApi(page, options);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('onb-v2-cta-phone')).toBeVisible({ timeout: 15000 });
}

async function capture(page, name) {
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({
    path: path.join(shotDir, `${name}.png`),
    fullPage: true,
    timeout: 15000,
  });
}

test('current email onboarding reaches role selection', async ({ page }) => {
  await freshOnboarding(page);
  await capture(page, '01-welcome-desktop');

  await page.getByTestId('onb-v2-cta-phone').click();
  await expect(page.getByTestId('email-v2-input')).toBeVisible();
  await expect(page.getByTestId('auth-google')).toBeVisible();
  await expect(page.getByTestId('auth-apple')).toBeVisible();
  await capture(page, '02-social-email-entry-desktop');

  const submit = page.getByTestId('phone-v2-cta');
  await expect(submit).toBeDisabled();
  await page.getByTestId('email-v2-input').fill('qa-onboarding-v2@urtruck.kz');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByTestId('otp-v2-screen')).toBeVisible({ timeout: 10000 });
  await capture(page, '03-email-otp-desktop');
  await page.getByTestId('otp-v2-input').fill('0000');

  await expect(page.getByTestId('role-v2-screen')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('role-v2-driver')).toBeVisible();
  await expect(page.getByTestId('role-v2-client')).toBeVisible();
  await expect(page.getByTestId('role-v2-cta')).toBeDisabled();
  await page.getByTestId('role-v2-driver').click();
  await expect(page.getByTestId('role-v2-cta')).toBeEnabled();
  await capture(page, '04-role-selection-desktop');
});

test('Google Apple and Email are the only visible login choices and back works', async ({ page }) => {
  await freshOnboarding(page);
  await page.getByTestId('onb-v2-cta-phone').click();

  await expect(page.getByTestId('auth-google')).toBeVisible();
  await expect(page.getByTestId('auth-apple')).toBeVisible();
  await expect(page.getByTestId('email-v2-input')).toBeVisible();
  await expect(page.getByTestId('auth-tab-phone')).toHaveCount(0);
  await expect(page.getByTestId('phone-v2-input')).toHaveCount(0);
  await capture(page, '05-social-email-entry-desktop');

  await page.getByTestId('phone-v2-back').click();
  await expect(page.getByTestId('onb-v2-cta-phone')).toBeVisible();
});

test('returning user session survives reload', async ({ page }) => {
  await freshOnboarding(page, { returningRole: 'client' });
  await page.getByTestId('onb-v2-cta-phone').click();
  await page.getByTestId('email-v2-input').fill('qa-returning@urtruck.kz');
  await page.getByTestId('phone-v2-cta').click();
  await page.getByTestId('otp-v2-input').fill('0000');

  await expect(page.getByTestId('bottom-nav')).toBeVisible({ timeout: 15000 });
  await capture(page, '06-returning-user-main-desktop');
  expect(await page.evaluate(() => localStorage.getItem('ur_reg_token'))).toBeTruthy();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bottom-nav')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('onb-v2-cta-phone')).toHaveCount(0);
});
