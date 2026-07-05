// e2e: вход по email (feature/email-otp).
//
// Гоняется против локального статик-прокси (scripts/e2e-static-proxy.js),
// который раздаёт dist/ и проксирует /api/* на локальный backend в
// BETA-режиме (универсальный код 0000). Проверяем реальный UI-путь:
//   OnboardingV2 → PhoneV2 → переключатель Email → ввод почты →
//   OtpV2 → ввод кода → экран выбора роли (RoleV2) = успешный вход.
//
// Base URL берём из E2E_BASE (по умолчанию http://127.0.0.1:4599).
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4599';
const BETA_CODE = process.env.E2E_BETA_CODE || '0000';

test('вход по email доходит до выбора роли', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1) Онбординг → «Продолжить по номеру» (общая точка входа в auth).
  const toPhone = page.locator('[data-testid="onb-v2-cta-phone"]');
  await toPhone.waitFor({ state: 'visible', timeout: 30000 });
  await toPhone.click();

  // 2) На экране PhoneV2 переключаемся на канал Email.
  const emailTab = page.locator('[data-testid="auth-tab-email"]');
  await emailTab.waitFor({ state: 'visible', timeout: 15000 });
  await emailTab.click();

  // 3) Вводим e-mail и продолжаем.
  const emailInput = page.locator('[data-testid="email-v2-input"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill('e2e-driver@qq.com');

  const cta = page.locator('[data-testid="phone-v2-cta"]');
  await expect(cta).toBeEnabled();
  await cta.click();

  // 4) Экран OTP (OtpV2) — фокус на ячейки (скрытый input) и набор BETA-кода.
  const cells = page.locator('[data-testid="otp-v2-cells"]');
  await cells.waitFor({ state: 'visible', timeout: 15000 });
  await cells.click();
  await page.locator('[data-testid="otp-v2-input"]').fill(BETA_CODE);

  // 5) После verify без роли — редирект на выбор роли (RoleV2).
  const roleScreen = page.locator('[data-testid="role-v2-screen"]');
  await roleScreen.waitFor({ state: 'visible', timeout: 20000 });
  await expect(page.locator('[data-testid="role-v2-driver"]')).toBeVisible();
});
