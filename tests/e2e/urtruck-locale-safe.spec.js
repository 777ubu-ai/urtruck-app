const { test, expect } = require('@playwright/test');

// Safe tests: run against local dist or live site.
// Local: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test
// Live:  npx playwright test (uses https://urtruck.kz)
const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=locale-safe';

// Russian UI strings that must NOT appear in EN/CN locales.
// Includes everything from the audit list the user provided.
const RU_FORBIDDEN = [
  'Фильтры', 'Тип кузова', 'Сортировка', 'Новые', 'Сбросить', 'Применить',
  'Активен', 'Откликнуться', 'Водитель', 'Маршрут рейса',
  'Статус рейса', 'Запланирован', 'Текущий статус', 'Груз принят',
  'В пути', 'Доставлен',
  'Написать водителю', 'Оставить отзыв',
  'Чаты', 'ВСЕГДА ОНЛАЙН', 'Диалоги',
  'Биометрия', 'Быстрая авторизация', 'Проверка через госбазу',
  'Банковский счёт', 'Приём платежей',
  'Добавьте имя', 'Светлая', 'Тёмная',
  'Моя работа', 'Грузы', 'Профиль',
  'Скоро', 'Собеседник', 'Аноним',
  'Рейс', 'Маршрут', 'Даты', 'Транспорт',
  'Пожаловаться на водителя', 'НАДЁЖНОСТЬ',
];

// KZ shares Cyrillic with RU but has its own translations for these specific UI labels.
// Only check the truly distinct ones (KZ uses 'Профиль', 'Тема', 'Рейтинг' as in RU).
const KZ_DISTINCT_RU = [
  'Фильтры', 'Сортировка', 'Сбросить', 'Применить', 'Откликнуться',
  'Светлая', 'Тёмная', 'Добавьте имя', 'Написать водителю',
  'Чаты', 'ВСЕГДА ОНЛАЙН', 'Диалоги', 'Собеседник',
  'Быстрая авторизация', 'Проверка через госбазу',
  'Банковский счёт', 'Приём платежей', 'Скоро',
  'Запланирован', 'Груз принят', 'Доставлен',
  'Пожаловаться на водителя', 'НАДЁЖНОСТЬ',
];

async function mockBackend(page) {
  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, token: 'pw-tok', access_token: 'pw-tok',
        role: 'driver', user_id: 'pw-d',
        user: { id: 'pw-d', role: 'driver' },
      }),
    });
  });
  await page.route('**/api/v1/market/cargos**', async route => {
    if (route.request().url().includes('/cargos/')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'c1', from_city: 'Almaty', to_city: 'Moscow',
          cargo_desc: 'Test', cargo_type: 'general',
          truck_type: 'tent', price: 3500, status: 'active',
          weight_tons: 20, volume_m3: 82,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        cargos: [{
          id: 'c1', from_city: 'Almaty', to_city: 'Moscow',
          cargo_desc: 'Test cargo', cargo_type: 'general',
          weight_tons: 20, volume_m3: 82, truck_type: 'tent',
          price: 3500, status: 'active', bids_count: 2,
          created_at: '2026-05-01', owner_id: 'other',
        }],
        total: 1,
      }),
    });
  });
  await page.route('**/api/v1/market/trips**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        trips: [{
          id: 't1', driver_name: 'Demo Driver',
          from_city: 'Almaty', to_city: 'Moscow', transit_city: '',
          truck_type: 'tent', capacity_tons: 20, available_m3: 82,
          price: 3500, status: 'active',
          departure_date: '2026-05-10', arrival_date: '2026-05-15',
        }],
      }),
    });
  });
  await page.route('**/api/v1/market/drivers**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        drivers: [{
          id: 'd1', full_name: 'Demo Driver',
          vehicle_type: 'tent', vehicle_capacity_kg: 20000,
          rating: 4.8, reviews_count: 12, is_verified: true,
        }],
      }),
    });
  });
  await page.route('**/api/v1/market/my', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        my_trips: [], my_cargos: [], my_bids: [],
        incoming_bids: [], my_deals: [],
      }),
    });
  });
  await page.route('**/api/v1/register/me', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'pw-d', role: 'driver', verification_level: 1 }),
    });
  });
  await page.route('**/api/v1/market/bids**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ bids: [] }),
    });
  });
  await page.route('**/api/v1/reviews**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ reviews: [], summary: { count: 0, average: 0 } }),
    });
  });
  await page.route('**/api/v1/chat/contacts**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ contacts: [] }),
    });
  });
  await page.route('**/api/v1/chat/rooms**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ rooms: [] }),
    });
  });
  await page.route('**/api/v1/users/me**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'pw-d', name: 'Demo', city: '', about: '' }),
    });
  });
}

async function enterAsDriver(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => {
    localStorage.setItem('ur_reg_token', 'pw-tok-locale');
    localStorage.setItem('ur_session', JSON.stringify({ user: { id: 'pw-d', role: 'driver' } }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
}

async function bodyText(page) {
  return await page.locator('body').innerText();
}

function assertNoRussian(body, locale, list = RU_FORBIDDEN) {
  for (const ru of list) {
    expect(body, `Found Russian "${ru}" in ${locale}`).not.toContain(ru);
  }
  expect(body, `Found raw key "editProfile" in ${locale}`).not.toMatch(/\beditProfile\b/);
}

// ─── RU BASELINE ───
test.describe('RU locale', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('RU feed + filter + profile', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await expect(page.getByText('Грузы').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="bottom-nav-mywork"]')).toBeVisible();
    await expect(page.locator('[data-testid="bottom-nav-chats"]')).toBeVisible();
    await expect(page.locator('[data-testid="bottom-nav-profile"]')).toBeVisible();

    const filterBtn = page.locator('[style*="filterBtn"], button').filter({ hasText: '⚙' }).first();
    if (await filterBtn.isVisible().catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(500);
      const body = await bodyText(page);
      expect(body).toContain('Фильтры');
      expect(body).toContain('Сортировка');
      expect(body).toContain('Применить');
    }

    await page.locator('[data-testid="bottom-nav-profile"]').click();
    await page.waitForTimeout(1500);
    const profileBody = await bodyText(page);
    expect(profileBody).toContain('Тема');
    expect(profileBody).toContain('Светлая');
    expect(profileBody).not.toMatch(/\beditProfile\b/);
  });
});

// ─── EN: feed + profile crawl + chats + reviews + edit profile ───
test.describe('EN locale', () => {
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

  test('EN feed + nav + tab labels', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await expect(page.getByText('Cargos').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Trips').first()).toBeVisible();
    await expect(page.getByText('Profile').first()).toBeVisible();

    const feedBody = await bodyText(page);
    assertNoRussian(feedBody, 'EN');
  });

  test('EN profile + chats + reviews + edit profile crawl — no Russian', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    // Profile tab
    await page.locator('[data-testid="bottom-nav-profile"]').click();
    await page.waitForTimeout(1500);
    const profileBody = await bodyText(page);
    assertNoRussian(profileBody, 'EN profile');
    expect(profileBody).toContain('Theme');
    expect(profileBody).toContain('Light');
    expect(profileBody).toContain('Dark');

    // Chats — click on the menu row containing 'Chats'
    await page.locator('[data-testid="bottom-nav-chats"]').click().catch(() => {});
    await page.waitForTimeout(1500);
    const chatsBody = await bodyText(page);
    assertNoRussian(chatsBody, 'EN chats');

    // Back to profile
    await page.goBack().catch(() => {});
    await page.waitForTimeout(800);

    // Reviews
    const reviewsLink = page.getByText(/My reviews|All reviews|Reviews/i).first();
    if (await reviewsLink.isVisible().catch(() => false)) {
      await reviewsLink.click();
      await page.waitForTimeout(1500);
      const reviewsBody = await bodyText(page);
      assertNoRussian(reviewsBody, 'EN reviews');
      await page.goBack().catch(() => {});
      await page.waitForTimeout(800);
    }

    // Edit profile
    const editLink = page.getByText(/Edit profile/i).first();
    if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(1500);
      const editBody = await bodyText(page);
      assertNoRussian(editBody, 'EN edit profile');
    }
  });

  test('EN cargo card click → CargoDetail no Russian leftovers', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await page.locator('[data-testid="cargo-card"]').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const detailBody = await bodyText(page);
    assertNoRussian(detailBody, 'EN cargo detail');
  });

  test('EN My Work tab — no Russian', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await page.locator('[data-testid="bottom-nav-mywork"]').click();
    await page.waitForTimeout(1500);
    const workBody = await bodyText(page);
    assertNoRussian(workBody, 'EN my work');
  });
});

// ─── CN: feed + profile crawl + chats + reviews + edit profile ───
test.describe('CN locale', () => {
  test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });

  test('CN feed + nav + tab labels', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await expect(page.getByText('货物').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('行程').first()).toBeVisible();
    await expect(page.getByText('个人资料').first()).toBeVisible();

    const feedBody = await bodyText(page);
    assertNoRussian(feedBody, 'CN');
  });

  test('CN profile + chats + reviews + edit profile crawl — no Russian', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await page.locator('[data-testid="bottom-nav-profile"]').click();
    await page.waitForTimeout(1500);
    const profileBody = await bodyText(page);
    assertNoRussian(profileBody, 'CN profile');
    expect(profileBody).toContain('主题');

    // Chats
    await page.locator('[data-testid="bottom-nav-chats"]').click().catch(() => {});
    await page.waitForTimeout(1500);
    const chatsBody = await bodyText(page);
    assertNoRussian(chatsBody, 'CN chats');

    await page.goBack().catch(() => {});
    await page.waitForTimeout(800);

    // Reviews
    const reviewsLink = page.getByText(/评价|评论/i).first();
    if (await reviewsLink.isVisible().catch(() => false)) {
      await reviewsLink.click();
      await page.waitForTimeout(1500);
      const reviewsBody = await bodyText(page);
      assertNoRussian(reviewsBody, 'CN reviews');
      await page.goBack().catch(() => {});
      await page.waitForTimeout(800);
    }

    // Edit profile
    const editLink = page.getByText(/编辑资料/i).first();
    if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(1500);
      const editBody = await bodyText(page);
      assertNoRussian(editBody, 'CN edit profile');
    }
  });

  test('CN My Work tab — no Russian', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await page.locator('[data-testid="bottom-nav-mywork"]').click();
    await page.waitForTimeout(1500);
    const workBody = await bodyText(page);
    assertNoRussian(workBody, 'CN my work');
  });
});

// ─── KZ: feed + profile crawl ───
test.describe('KZ locale', () => {
  test.use({ locale: 'kk-KZ', timezoneId: 'Asia/Almaty' });

  test('KZ feed + tab labels', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await expect(page.getByText('Жүктер').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Рейстер').first()).toBeVisible();

    const feedBody = await bodyText(page);
    assertNoRussian(feedBody, 'KZ feed', KZ_DISTINCT_RU);
  });

  test('KZ profile + chats + edit profile crawl', async ({ page }) => {
    await mockBackend(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await page.locator('[data-testid="bottom-nav-profile"]').click();
    await page.waitForTimeout(1500);
    const profileBody = await bodyText(page);
    expect(profileBody).toContain('Жарық');
    expect(profileBody).not.toMatch(/\beditProfile\b/);
    assertNoRussian(profileBody, 'KZ profile', KZ_DISTINCT_RU);

    // Chats
    await page.locator('[data-testid="bottom-nav-chats"]').click().catch(() => {});
    await page.waitForTimeout(1500);
    const chatsBody = await bodyText(page);
    assertNoRussian(chatsBody, 'KZ chats', KZ_DISTINCT_RU);

    await page.goBack().catch(() => {});
    await page.waitForTimeout(800);

    // Edit profile
    const editLink = page.getByText(/Профильді өзгерту/i).first();
    if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(1500);
      const editBody = await bodyText(page);
      assertNoRussian(editBody, 'KZ edit profile', KZ_DISTINCT_RU);
    }
  });
});
