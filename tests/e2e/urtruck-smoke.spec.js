const { test, expect } = require('@playwright/test');

// Safe tests: run locally or against live site.
// Local: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test
const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=playwright-safe-smoke';

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

  await page.route('**/api/v1/market/cargos/*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'pw-cargo-1',
        from_city: 'Алматы',
        to_city: 'Москва',
        cargo_desc: 'Playwright тестовый груз',
        cargo_type: 'general',
        weight_tons: 20,
        volume_m3: 120,
        truck_type: 'tent',
        price: 3500,
        status: 'active',
        bids_count: 0,
        created_at: '2026-04-30',
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
            id: 'pw-cargo-1',
            from_city: 'Алматы',
            to_city: 'Москва',
            cargo_desc: 'Playwright тестовый груз',
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

test('open app and check main screen', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await expect(page.getByText('UrTruck')).toBeVisible({ timeout: 15000 });
});

test('driver flow opens feed without live backend', async ({ page }) => {
  await mockDriverBackend(page);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText(/Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i).click();
  await page.waitForTimeout(2500);

  await expect(page.getByText(/Грузы|Cargos/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Playwright тестовый груз')).toBeVisible({ timeout: 15000 });
});

test('click first cargo card does not crash without live backend', async ({ page }) => {
  await mockDriverBackend(page);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText(/Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i).click();
  await page.waitForTimeout(2500);

  await page.getByText('Playwright тестовый груз').click();
  await page.waitForTimeout(2500);

  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0);
});
