const { test, expect } = require('@playwright/test');

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Локальный адрес обязателен');

test('на первом экране входа можно выбрать язык без гостевого доступа', async ({ page }) => {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('email-v2-input')).toBeVisible();
  for (const [code, title] of [
    ['ru', 'Вход или регистрация'], ['cn', '登录或注册'],
    ['en', 'Sign in or sign up'], ['kz', 'Кіру немесе тіркелу'],
  ]) {
    await page.getByTestId('auth-language-switcher').click();
    await page.getByTestId(`lang-${code}`).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByTestId('auth-google')).toBeVisible();
    await expect(page.getByTestId('email-v2-input')).toBeVisible();
    await expect(page.getByTestId('bottom-nav')).toHaveCount(0);
  }
});
