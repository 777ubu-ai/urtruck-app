const { test, expect } = require('@playwright/test');

// Проверка настоящего UI с моками API; аккаунты и сообщения на сервере не создаются.
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4175';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error('Profile recovery mock test requires a local web export');
}

async function openProfile(page, role, response = { ok: true }) {
  const state = { role: 'guest', level: 1, patches: [], completes: 0, completeResponse: { ok: true }, response, pageErrors: [] };
  page.on('pageerror', (error) => state.pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/api/v1/')) {
      let body = {};
      if (url.pathname.endsWith('/register/email/send')) {
        body = { sent: true, mock: true, code: '0000', channel: 'email' };
      } else if (url.pathname.endsWith('/register/email/verify')) {
        body = { token: 'mock-profile-token', verification_level: 1, role: null, is_new: true };
      } else if (url.pathname.endsWith('/register/me')) {
        body = { id: 'mock-profile-user', role: state.role, verification_level: state.level, phone: null, full_name: '' };
      } else if (url.pathname.endsWith('/users/me')) {
        if (request.method() === 'PATCH') {
          state.patches.push(request.postDataJSON());
          body = state.response.body || state.response;
          if (body.ok) state.role = role;
          return route.fulfill({ status: state.response.status || 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
        body = { id: 'mock-profile-user', name: '', phone: null, role: state.role };
      } else if (url.pathname.endsWith('/driver/registration/complete-basic')) {
        state.completes++;
        return route.fulfill({ status: state.completeResponse.ok ? 200 : 503, contentType: 'application/json', body: JSON.stringify(state.completeResponse) });
      } else if (url.pathname.includes('/driver/registration')) {
        body = { ok: true, draft: {} };
      } else if (/unread|notifications/.test(url.pathname)) {
        body = { count: 0, items: [], threads: [] };
      } else if (url.pathname.includes('/market/')) {
        body = { items: [], cargos: [], trips: [] };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.origin !== new URL(base).origin) return route.abort();
    return route.continue();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('onb-v2-cta-phone').click();
  await page.getByTestId('email-v2-input').fill('qa-profile@example.test');
  await page.getByTestId('phone-v2-cta').click();
  await expect(page.getByTestId('otp-v2-screen')).toBeVisible();
  await page.getByTestId('otp-v2-cells').click();
  await page.getByTestId('otp-v2-input').fill('0000');
  await expect(page.getByTestId('role-v2-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId(`role-v2-${role}`).click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-screen')).toBeVisible();
  await page.getByTestId('profile-v2-name').fill('QA Profile');
  await page.getByTestId('profile-v2-phone').fill('+77000000001');
  if (process.env.REGISTRATION_SCREENSHOTS && page.viewportSize().width === 393) {
    await page.getByTestId('profile-v2-screen').screenshot({ path: process.env.REGISTRATION_SCREENSHOTS + '/' + role + '-registration.png' });
  }
  return state;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 852 }]) {
test.describe(`Profile recovery ${viewport.width}px`, () => {
  test.use({ viewport, permissions: ['notifications'] });

test('client сохраняет профиль с пустыми optional fields', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await expect(page.getByTestId('profile-v2-cta')).toBeVisible();
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('profile-v2-screen')).toHaveCount(0);
  expect(state.patches).toHaveLength(1);
  expect(state.patches[0]).toEqual({ role: 'client', name: 'QA Profile', phone: '+77000000001' });
});

test('обе роли видят только имя и телефон, подтверждённая почта показана отдельно', async ({ page }) => {
  await openProfile(page, 'client');
  for (const field of ['company', 'country', 'city', 'messenger', 'iin', 'birthDate']) {
    await expect(page.getByTestId(`profile-v2-${field}`)).toHaveCount(0);
  }
  await expect(page.getByTestId('profile-v2-screen').getByTestId('auth-confirmed-email')).toBeVisible();
  await expect(page.getByTestId('profile-v2-cta')).toBeEnabled();
});

test('ошибка смены телефона видна, данные сохранены, повторный Save возможен', async ({ page }) => {
  const state = await openProfile(page, 'client', { status: 400, body: { detail: { error: 'PHONE_CHANGE_OTP_REQUIRED' } } });
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByText(/Этот аккаунт уже имеет подтверждённый номер/)).toBeVisible();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Profile');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('+77000000001');
  await expect(page.getByTestId('profile-v2-cta')).toBeEnabled();
  state.response = { ok: true };
  await page.getByTestId('profile-v2-phone').fill('+77000000002');
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('profile-v2-screen')).toHaveCount(0);
  expect(state.patches).toHaveLength(2);
});

test('driver после сохранения входит без добавления машины', async ({ page }) => {
  const state = await openProfile(page, 'driver');
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('profile-v2-screen')).toHaveCount(0);
  await expect(page.getByTestId('vehicle-setup-single-screen')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  expect(state.completes).toBe(1);
  expect(state.patches).toHaveLength(1);
});


test('гостевая сессия после reload не пропускает подтверждение входа', async ({ page }) => {
  const state = await openProfile(page, 'client');
  state.level = 0;
  await page.evaluate(() => localStorage.setItem('ur_verification_level', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('onb-v2-cta-phone')).toBeVisible();
  await expect(page.getByTestId('profile-v2-screen')).toHaveCount(0);
  await expect(page.getByTestId('role-v2-screen')).toHaveCount(0);
  expect(state.patches).toHaveLength(0);
});

test('подтверждённый аккаунт без роли восстанавливает выбор роли после reload', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('role-v2-screen')).toBeVisible();
  await page.getByTestId('role-v2-client').click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-screen')).toBeVisible();
  expect(state.patches).toHaveLength(0);
  expect(state.pageErrors).toEqual([]);
});
});
}
