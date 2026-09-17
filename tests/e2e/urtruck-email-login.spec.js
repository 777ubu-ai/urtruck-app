// e2e: вход по email (feature/email-otp).
//
// Гоняется против локального статик-прокси (scripts/e2e-static-proxy.js),
// который раздаёт dist/ и проксирует /api/* на локальный backend в
// BETA-режиме (универсальный код 0000). Проверяем реальный UI-путь:
//   OnboardingV2 → PhoneV2 → прямой ввод Email →
//   OtpV2 → ввод кода → RoleV2 либо Main для beta-профиля = успешный вход.
//
// Base URL берём из E2E_BASE (по умолчанию http://127.0.0.1:4599).
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4599';
const BETA_CODE = process.env.E2E_BETA_CODE || '0000';

test('вход по email доходит до выбора роли', async ({ page }) => {
  const email = `e2e-email-${Date.now().toString(36)}@urtruck.qa`;
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1) Онбординг → общая точка входа в auth.
  const toPhone = page.locator('[data-testid="onb-v2-cta-phone"]');
  await toPhone.waitFor({ state: 'visible', timeout: 30000 });
  await toPhone.click();

  // 2) Email — прямой канонический input, отдельной legacy-вкладки нет.
  const emailInput = page.locator('[data-testid="email-v2-input"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(email);

  const cta = page.locator('[data-testid="phone-v2-cta"]');
  await expect(cta).toBeEnabled();
  await cta.click();

  // 3) Экран OTP (OtpV2) — фокус на ячейки (скрытый input) и набор BETA-кода.
  const cells = page.locator('[data-testid="otp-v2-cells"]');
  await cells.waitFor({ state: 'visible', timeout: 15000 });
  await cells.click();
  await page.locator('[data-testid="otp-v2-input"]').fill(BETA_CODE);

  // 4) Новый профиль без роли идёт в RoleV2. Локальный BETA backend
  // намеренно провижнит готовую driver-роль, поэтому он корректно ведёт
  // сразу в Main. Обе ветви проверяют реальный канонический контракт.
  const roleScreen = page.locator('[data-testid="role-v2-screen"]');
  const bottomNav = page.locator('[data-testid="bottom-nav"]');
  await Promise.race([
    roleScreen.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    bottomNav.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);
  if (await roleScreen.isVisible().catch(() => false)) {
    await expect(page.locator('[data-testid="role-v2-driver"]')).toBeVisible();
  } else {
    await expect(bottomNav).toBeVisible();
    await expect(page.locator('[data-testid="bottom-nav-queue"]')).toBeVisible();
  }
});
