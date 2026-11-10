const { test, expect } = require('@playwright/test');

// Проверка настоящего UI с моками API; аккаунты и сообщения на сервере не создаются.
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4175';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error('Profile recovery mock test requires a local web export');
}

async function openProfile(page, role, response = { ok: true }) {
  const state = { userId: 'mock-profile-user', role: 'guest', level: 1, patches: [], completes: 0, completeResponse: { ok: true }, response, pageErrors: [] };
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
        body = { id: state.userId, role: state.role, verification_level: state.level, phone: null, full_name: '' };
      } else if (url.pathname.endsWith('/users/me')) {
        if (request.method() === 'PATCH') {
          state.patches.push(request.postDataJSON());
          body = state.response.body || state.response;
          if (body.ok) state.role = role;
          return route.fulfill({ status: state.response.status || 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
        body = { id: state.userId, name: '', phone: null, role: state.role };
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
  await expect(page.getByTestId('role-v2-cta')).toBeDisabled();
  if (process.env.REGISTRATION_SCREENSHOTS && page.viewportSize().width === 393) {
    await page.getByTestId('role-v2-screen').screenshot({ path: process.env.REGISTRATION_SCREENSHOTS + '/role-selection.png' });
  }
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

for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 852 }, { width: 360, height: 800 }]) {
test.describe(`Profile recovery ${viewport.width}px`, () => {
  test.use({ viewport, permissions: ['notifications'] });

test('черновик регистрации сохраняется после возврата к роли и перезапуска страницы', async ({ page }) => {
  await openProfile(page, 'client');
  await page.getByTestId('profile-v2-name').fill('QA Draft');
  await page.getByTestId('profile-v2-phone').fill('+8613800138000');
  await page.getByTestId('profile-v2-screen').getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByTestId('role-v2-screen')).toBeVisible();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Draft');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('13800138000');
  await page.reload();
  await expect(page.getByTestId('role-v2-screen')).toBeVisible();
  await page.getByTestId('role-v2-client').click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Draft');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('13800138000');
});

test('черновики регистрации изолированы по владельцу и роли', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await page.getByTestId('profile-v2-name').fill('Owner A Draft');
  await page.getByTestId('profile-v2-phone').fill('+77000000002');
  await page.getByTestId('profile-v2-screen').getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByTestId('role-v2-driver').click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('');
  state.userId = 'mock-other-owner';
  await page.reload();
  await page.getByTestId('role-v2-client').click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('');
  state.userId = 'mock-profile-user';
  await page.reload();
  await page.getByTestId('role-v2-client').click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('Owner A Draft');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('7000000002');
});

test('черновик очищается после успешного сохранения', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  state.role = 'guest';
  await page.reload();
  await page.getByTestId('role-v2-client').click();
  await page.getByTestId('role-v2-cta').click();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('');
});

test('client сохраняет профиль с пустыми optional fields', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await expect(page.getByTestId('profile-v2-cta')).toBeVisible();
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('registration-completion')).toBeVisible();
  if (process.env.REGISTRATION_SCREENSHOTS && page.viewportSize().width === 393) {
    await page.getByTestId('registration-completion').screenshot({ path: process.env.REGISTRATION_SCREENSHOTS + '/success.png' });
  }
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
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('7000000001');
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



test('пустая форма блокирует сохранение; неверный номер не отправляется', async ({ page }) => {
  const state = await openProfile(page, 'driver');
  await page.getByTestId('profile-v2-name').fill('');
  await expect(page.getByTestId('profile-v2-cta')).toBeDisabled();
  await page.getByTestId('profile-v2-name').fill('Иван');
  await page.getByTestId('profile-v2-phone').fill('123');
  await expect(page.getByTestId('profile-v2-cta')).toBeDisabled();
  expect(state.patches).toHaveLength(0);
});
test('код Китая и международный номер сохраняются без потери цифр', async ({ page }) => {
  const state = await openProfile(page, 'driver');
  await page.getByTestId('profile-v2-phone-country').click();
  await page.getByTestId('country-row-CN').click();
  await page.getByTestId('profile-v2-phone').fill('13800138000');
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  expect(state.patches[0].phone).toBe('+8613800138000');
});
test('ошибка complete-basic сохраняет форму, повторный запрос успешен', async ({ page }) => {
  const state = await openProfile(page, 'driver');
  state.completeResponse = { ok: false };
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByText('Не удалось сохранить. Попробуйте ещё раз.')).toBeVisible();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Profile');
  state.completeResponse = { ok: true };
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  expect(state.completes).toBe(2);
});
test('смена языка не очищает форму, регистрация остаётся светлой', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await page.getByTestId('profile-v2-screen').getByTestId('registration-language').click();
  await page.getByTestId('lang-en').click();
  await expect(page.getByTestId('profile-v2-cta')).toContainText('Save and enter');
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Profile');
  for (const [code, label] of [['cn', '保存并进入'], ['kz', 'Сақтау және кіру']]) {
    await page.getByTestId('profile-v2-screen').getByTestId('registration-language').click();
    await page.getByTestId('lang-' + code).click();
    await expect(page.getByTestId('profile-v2-cta')).toContainText(label);
    await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Profile');
  }
  await expect(page.getByTestId('profile-v2-screen')).toHaveCSS('background-color', 'rgb(247, 243, 236)');
  expect(state.pageErrors).toEqual([]);
});


test('повторные нажатия создают один запрос сохранения', async ({ page }) => {
  const state = await openProfile(page, 'client');
  await page.getByTestId('profile-v2-cta').evaluate((button) => { button.click(); button.click(); button.click(); });
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  expect(state.patches).toHaveLength(1);
});
test('ошибка сервера сохраняет данные и позволяет повторить', async ({ page }) => {
  const state = await openProfile(page, 'client', { status: 503, body: { ok: false } });
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByText(/Сервер временно недоступен/)).toBeVisible();
  await expect(page.getByTestId('profile-v2-name')).toHaveValue('QA Profile');
  await expect(page.getByTestId('profile-v2-phone')).toHaveValue('7000000001');
  state.response = { ok: true };
  await page.getByTestId('profile-v2-cta').click();
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
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
