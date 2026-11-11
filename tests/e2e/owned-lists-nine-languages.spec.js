// Только отдельный локальный beta API и синтетические аккаунты.
const { test, expect, request } = require('@playwright/test');
const H = require('./helpers/webflow');
if (!['127.0.0.1', 'localhost'].includes(new URL(H.BASE).hostname)) throw Error('Разрешён только локальный стенд');
const languages = ['RU', 'KK', 'EN', 'ZH', 'TR', 'UZ', 'KY', 'TG', 'BE'];
const sessions = {};
test.beforeAll(async () => {
  const api = await request.newContext();
  for (const role of ['client', 'driver']) {
    const token = await H.apiEmailToken(api, `nine-${role}-${Date.now()}@urtruck.test`, role);
    const response = await api.get(`${H.API}/register/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.ok()).toBeTruthy();
    const user = await response.json();
    expect(user.role).toBe(role);
    sessions[role] = { token, id: user.id, role };
  }
  await api.dispose();
});
for (const language of languages) for (const role of ['client', 'driver']) {
  test(`${language} / ${role}: главная и личные объявления`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(H.BASE);
    await page.evaluate(({ session, language }) => {
      localStorage.setItem('ur_reg_token', session.token);
      localStorage.setItem('ur_session', JSON.stringify({ user: { id: session.id, role: session.role } }));
      localStorage.setItem('ur_verification_level', '2');
      localStorage.setItem('ur_lang', language);
      localStorage.setItem(`ur_external_feed_first_visit_v1:${session.id}`, '1');
    }, { session: sessions[role], language });
    await page.reload();
    await expect(page.getByTestId('bottom-nav-mywork')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('bottom-nav-mywork').click();
    const work = page.getByTestId('my-work-screen');
    await expect(work).toBeVisible();
    await expect(work.getByTestId('my-work-archive-toggle')).toBeVisible();
    const text = await work.innerText();
    expect(text).not.toMatch(/\b(?:my_trips_title|my_cargos_title|tab_archive|load_error)\b/);
    expect(errors).toEqual([]);
  });
}
