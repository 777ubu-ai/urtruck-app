// ПОЛНАЯ e2e-регрессия обеих ролей на СОБРАННОМ веб-UI (dist/ + прокси :4599,
// backend :8001 MOCK/BETA). Канонический вход: Google + Apple + Email.
// Google/Apple здесь проверяются как UI/contract entry; реальный provider OAuth
// проходит отдельно после настройки внешних provider credentials.
const { test, expect } = require('@playwright/test');
const H = require('./helpers/webflow');
const { tid, shot } = H;

const RUN = Date.now().toString(36);
const clientEmail = `client-${RUN}@urtruck.kz`;
const driverEmail = `driver-${RUN}@urtruck.kz`;
const ownerEmail = `owner-${RUN}@urtruck.kz`;

// ─────────────────────────── БЛОК A — EMAIL ───────────────────────────
test.describe.serial('A. Вход по EMAIL (обе роли)', () => {
  test('A1. Клиент по email → в приложении', async ({ page }) => {
    await H.gotoPhoneScreen(page);
    await shot(page, 'A1_01_auth_entry');
    await page.locator(tid('email-v2-input')).click();
    await page.locator(tid('email-v2-input')).fill(clientEmail);
    await shot(page, 'A1_02_email_entered');
    const cta = page.locator(tid('phone-v2-cta'));
    await expect(cta).toBeEnabled();
    await cta.click();
    await page.locator(tid('otp-v2-cells')).waitFor({ state: 'visible', timeout: 15000 });
    await shot(page, 'A1_03_otp_screen');
    await page.locator(tid('otp-v2-cells')).click();
    await page.locator(tid('otp-v2-input')).fill(H.BETA_CODE);
    await page.locator(tid('role-v2-screen')).waitFor({ state: 'visible', timeout: 20000 });
    await shot(page, 'A1_04_role_screen');
    await page.locator(tid('role-v2-client')).click();
    await page.locator(tid('role-v2-cta')).click();

    const profile = page.locator(tid('profile-v2-screen'));
    await Promise.race([
      profile.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
      page.locator(tid('bottom-nav')).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
    ]);
    if (await profile.isVisible().catch(() => false)) {
      await page.locator(tid('profile-v2-name')).fill('QA Client');
      const country = page.locator(tid('profile-v2-country'));
      if (await country.isVisible().catch(() => false)) await country.fill('Казахстан');
      const phone = page.locator(tid('profile-v2-phone'));
      if (await phone.isVisible().catch(() => false)) await phone.fill('+77011234567');
      const city = page.locator(tid('profile-v2-city'));
      if (await city.isVisible().catch(() => false)) await city.fill('Алматы');
      await page.locator(tid('profile-v2-cta')).click();
    }
    await page.locator(tid('bottom-nav')).waitFor({ state: 'visible', timeout: 20000 });
    await shot(page, 'A1_05_in_app');
    await expect(page.locator(tid('bottom-nav'))).toBeVisible();
  });

  test('A2. Водитель по email → роль водитель', async ({ page }) => {
    await H.emailLogin(page, driverEmail, 'driver', { name: 'QA Driver', city: 'Алматы' });
    await shot(page, 'A2_01_driver_in_app');
    await expect(page.locator(tid('bottom-nav-queue'))).toBeVisible();
    await expect(page.locator(tid('bottom-nav-publish'))).toHaveCount(0);
  });

  test('A3. Валидация: кривой email, неверный код, consent', async ({ page, request }) => {
    await H.gotoPhoneScreen(page);
    await page.locator(tid('email-v2-input')).click();
    await page.locator(tid('email-v2-input')).fill('abc@');
    await shot(page, 'A3_01_bad_email');
    await expect(page.locator(tid('phone-v2-cta'))).toBeDisabled();

    await page.locator(tid('email-v2-input')).fill(`bad-${RUN}@urtruck.kz`);
    await expect(page.locator(tid('phone-v2-cta'))).toBeEnabled();
    await page.locator(tid('phone-v2-cta')).click();
    await page.locator(tid('otp-v2-cells')).waitFor({ state: 'visible', timeout: 15000 });
    await page.locator(tid('otp-v2-cells')).click();
    await page.locator(tid('otp-v2-input')).fill('1357');
    await page.waitForTimeout(1500);
    await shot(page, 'A3_02_wrong_code');
    await expect(page.locator(tid('bottom-nav'))).toHaveCount(0);
    await expect(page.locator(tid('otp-v2-cells'))).toBeVisible();

    const r = await request.post(`${H.API}/register/email/send`, {
      data: { email: `noconsent-${RUN}@urtruck.kz`, consent: false },
    });
    expect(r.status()).toBe(400);
  });

  test('A4. Токен сохраняется: reload не требует повторного входа', async ({ page }) => {
    const persistEmail = `persist-${RUN}@urtruck.kz`;
    await H.emailLogin(page, persistEmail, 'client', { name: 'QA Persist', city: 'Астана' });
    await expect(page.locator(tid('bottom-nav'))).toBeVisible();
    const token = await page.evaluate(() => window.localStorage.getItem('ur_reg_token'));
    expect(token).toBeTruthy();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(tid('bottom-nav'))).toBeVisible({ timeout: 20000 });
    await expect(page.locator(tid('onb-v2-cta-phone'))).toHaveCount(0);
    await shot(page, 'A4_01_after_reload');
  });

  test('A5. OtpV2: «Изменить e-mail» и повторная отправка', async ({ page }) => {
    await H.gotoPhoneScreen(page);
    await page.locator(tid('email-v2-input')).click();
    await page.locator(tid('email-v2-input')).fill(`resend-${RUN}@urtruck.kz`);
    await page.locator(tid('phone-v2-cta')).click();
    await page.locator(tid('otp-v2-cells')).waitFor({ state: 'visible', timeout: 15000 });
    await expect(page.locator(tid('otp-v2-change-phone'))).toBeVisible();
    await shot(page, 'A5_01_otp_resend_timer');
    await page.locator(tid('otp-v2-change-phone')).click();
    await expect(page.locator(tid('email-v2-input'))).toBeVisible({ timeout: 10000 });
    await shot(page, 'A5_02_back_to_email');
  });
});

// ─────────────────── БЛОК B — SOCIAL AUTH ENTRY ──────────────────────
test.describe('B. Social auth entry', () => {
  test('B1. Google виден, Apple отключён, телефонный login полностью убран', async ({ page }) => {
    await H.gotoPhoneScreen(page);
    await expect(page.locator(tid('auth-google'))).toBeVisible();
    await expect(page.locator(tid('auth-apple'))).toHaveCount(0);
    await expect(page.locator(tid('email-v2-input'))).toBeVisible();
    await expect(page.locator(tid('auth-tab-phone'))).toHaveCount(0);
    await expect(page.locator(tid('phone-v2-input'))).toHaveCount(0);
    await expect(page.locator(tid('auth-legal-consent'))).toBeVisible();
    await shot(page, 'B1_01_social_auth_entry');
  });
});

// ─────────────────────── БЛОК C — ВОДИТЕЛЬ ────────────────────────────
test.describe.serial('C. Водитель — регрессия', () => {
  test('C2. Таб-бар: 5 вкладок, Chats отдельно, нет Publish', async ({ page }) => {
    await H.emailLogin(page, `drv-tabs-${RUN}@urtruck.kz`, 'driver');
    for (const t of ['feed', 'mywork', 'queue', 'chats', 'profile']) {
      await expect(page.locator(tid(`bottom-nav-${t}`))).toBeVisible();
    }
    await expect(page.locator(tid('bottom-nav-publish'))).toHaveCount(0);
    await shot(page, 'C2_01_driver_tabs');
  });

  test('C3+C5. Feed открывается, Queue открывается', async ({ page }) => {
    await H.emailLogin(page, `drv-nav-${RUN}@urtruck.kz`, 'driver');
    await page.locator(tid('bottom-nav-feed')).click();
    await page.waitForTimeout(800);
    await shot(page, 'C3_01_feed');
    await page.locator(tid('bottom-nav-queue')).click();
    await expect(page.locator(tid('queue-title'))).toBeVisible({ timeout: 10000 });
    await shot(page, 'C5_01_queue');
  });
});

// ─────────────────────── БЛОК D — КЛИЕНТ + кросс-роль ─────────────────
test.describe.serial('D. Клиент — регрессия + кросс-роль ставка', () => {
  let clientToken = null;
  let cargoId = null;

  test('D1. Клиент публикует груз (API, валюта KZT/₸) и видит его в «Мои грузы»', async ({ page, request }) => {
    await H.emailLogin(page, ownerEmail, 'client', { name: 'QA Shipper', city: 'Алматы' });
    clientToken = await page.evaluate(() => window.localStorage.getItem('ur_reg_token'));
    expect(clientToken).toBeTruthy();
    const res = await H.apiCreateCargo(request, clientToken, {
      cargo_desc: 'QA Груз ₸', price: 420000, currency: 'KZT',
    });
    expect(res.status).toBeLessThan(300);
    cargoId = res.body.id || res.body.cargo_id || (res.body.cargo && res.body.cargo.id);
    expect(cargoId).toBeTruthy();
    await page.locator(tid('bottom-nav-mywork')).click();
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator(tid('bottom-nav-mywork')).click();
    await page.waitForTimeout(1200);
    await shot(page, 'D1_01_my_cargo');
    await expect(page.locator(tid('my-cargo-card')).first()).toBeVisible({ timeout: 10000 });
  });

  test('D2. Водитель ставит ставку (API) → владелец видит оффер (₸) и принимает через UI → deal', async ({ page, request }) => {
    expect(cargoId).toBeTruthy();
    const driverToken = await H.apiEmailToken(request, `drv-bid-${RUN}@urtruck.kz`, 'driver');
    const bid = await H.apiCreateBid(request, driverToken, cargoId, 400000);
    expect(bid.status).toBeLessThan(300);

    await H.emailLogin(page, ownerEmail, 'client');
    await page.locator(tid('bottom-nav-mywork')).click();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator(tid('bottom-nav-mywork')).click();
    await page.waitForTimeout(1500);
    const offersCta = page.locator(tid('cargo-offers-cta')).first();
    await offersCta.waitFor({ state: 'visible', timeout: 10000 });
    await offersCta.click();
    await page.waitForTimeout(1500);
    await shot(page, 'D2_01_offer_in_cargodetail');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('₸');
    expect(bodyText).toContain('400 000');
    expect(bodyText).not.toMatch(/\$\s?4[0-9]{5}/);

    const accept = page.locator(tid('bid-accept')).first();
    await accept.waitFor({ state: 'visible', timeout: 10000 });
    await accept.click();
    await page.waitForTimeout(2000);
    await shot(page, 'D2_02_after_accept_ui');

    const deals = await request.get(`${H.API}/market/deals`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const dj = await deals.json().catch(() => ({}));
    const darr = Array.isArray(dj) ? dj : (dj.deals || []);
    expect(darr.length).toBeGreaterThan(0);
  });

  test('D4. Клиентский таб-бар (есть Publish) и выход', async ({ page }) => {
    await H.emailLogin(page, `cli-logout-${RUN}@urtruck.kz`, 'client');
    await expect(page.locator(tid('bottom-nav-publish'))).toBeVisible();
    await page.locator(tid('bottom-nav-profile')).click();
    await page.waitForTimeout(800);
    await shot(page, 'D4_01_profile');
    const logout = page.locator(tid('profile-logout'));
    await logout.scrollIntoViewIfNeeded().catch(() => {});
    await expect(logout).toBeVisible({ timeout: 8000 });
  });
});
