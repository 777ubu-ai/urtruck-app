const { test, expect } = require('@playwright/test');

const BASE = 'https://urtruck.kz/?v=locale-safe';

async function mockDriverBackend(page) {
  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        token: 'playwright-driver-token',
        access_token: 'playwright-driver-token',
        role: 'driver',
        user_id: 'playwright-driver',
        user: { id: 'playwright-driver', role: 'driver' },
      }),
    });
  });

  await page.route('**/api/v1/market/cargos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cargos: [
          {
            id: 'pw-cargo-locale-1',
            from_city: 'Алматы',
            to_city: 'Москва',
            cargo_desc: 'Тестовый груз локали',
            cargo_type: 'general',
            weight_tons: 20,
            volume_m3: 120,
            truck_type: 'tent',
            price: 3500,
            status: 'active',
            bids_count: 0,
            created_at: '2026-04-30',
          },
        ],
        total: 1,
      }),
    });
  });
}

test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

test('RU locale shows Russian feed texts', async ({ page }) => {
  await mockDriverBackend(page);

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.reload({ waitUntil: 'networkidle' });

  await page.getByText(/Я водитель|Водитель|Driver/).click();
  await page.waitForTimeout(2500);

  const body = await page.locator('body').innerText();
  console.log('===== BODY RU LOCALE =====');
  console.log(body.slice(0, 3000));

  await expect(page.getByText('Грузы').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Опубликовать маршрут').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Откликнуться').first()).toBeVisible({ timeout: 15000 });

  await expect(page.getByText('Cargos')).toHaveCount(0);
  await expect(page.getByText('Publish trip')).toHaveCount(0);
  await expect(page.getByText('Respond')).toHaveCount(0);
});
