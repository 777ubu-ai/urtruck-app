// Только изолированный локальный beta API и отдельные синтетические аккаунты.
const { test, expect, request } = require('@playwright/test');
const H = require('./helpers/webflow');
if (!['127.0.0.1', 'localhost'].includes(new URL(H.BASE).hostname)) throw Error('Разрешён только локальный стенд');
for (const role of ['client', 'driver']) {
  test(`${role}: существующий пункт уведомлений доступен в web-профиле`, async ({ page }) => {
    const api = await request.newContext();
    const token = await H.apiEmailToken(api, `web-inbox-${role}-${Date.now()}@urtruck.test`, role);
    const me = await (await api.get(`${H.API}/register/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    await page.goto(H.BASE);
    await page.evaluate(({ token, me }) => {
      localStorage.setItem('ur_reg_token', token);
      localStorage.setItem('ur_session', JSON.stringify({ user: { id: me.id, role: me.role } }));
      localStorage.setItem('ur_verification_level', '2');
      localStorage.setItem(`ur_external_feed_first_visit_v1:${me.id}`, '1');
    }, { token, me });
    await page.reload();
    await expect(page.getByTestId('bottom-nav-mywork')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('bottom-nav-mywork').click();
    await page.getByTestId('mywork-menu-btn').click();
    const inbox = page.getByTestId('profile-notifications');
    await expect(inbox).toBeVisible({ timeout: 5000 });
    await inbox.click();
    await expect(page.getByTestId('notifications-menu-btn')).toBeVisible();
    await api.dispose();
  });
}
