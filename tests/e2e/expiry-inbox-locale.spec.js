// Изолированная browser-проверка отображения системного уведомления в inbox.
const { test, expect, request } = require('@playwright/test');
const H = require('./helpers/webflow');
if (!['127.0.0.1', 'localhost'].includes(new URL(H.BASE).hostname)) throw Error('Разрешён только локальный стенд');
const titles = {
  RU:'Срок публикации истёк', KK:'Жариялау мерзімі аяқталды', EN:'Publication period expired',
  ZH:'发布期限已过', TR:'İlanın yayın süresi doldu', UZ:'Eʼlonning joylashtirish muddati tugadi',
  KY:'Жарыялоонун мөөнөтү аяктады', TG:'Муҳлати нашри эълон ба охир расид', BE:'Тэрмін публікацыі аб’явы скончыўся',
};
const sessions = {};
test.use({viewport:{width:360,height:800}});
test.beforeAll(async () => {
  const api = await request.newContext();
  for (const role of ['client', 'driver']) {
    const token = await H.apiEmailToken(api, `expiry-i18n-${role}-${Date.now()}@urtruck.test`, role);
    const me = await (await api.get(`${H.API}/register/me`, {headers:{Authorization:`Bearer ${token}`}})).json();
    sessions[role] = {token, id:me.id, role};
  }
  await api.dispose();
});
for (const [language, title] of Object.entries(titles)) for (const role of ['client','driver']) {
  test(`${language} / ${role}: уведомление срока на языке экрана`, async ({page}) => {
    await page.route('**/api/v1/notifications?*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/api/v1/notifications') return route.continue();
      await route.fulfill({json:{notifications:[{id:1,type:'listing_lifecycle',event_key:`listing-expired:${role === 'client' ? 'cargo' : 'trip'}:fixture:period`,title:titles.RU,body:'Объявление сохранено в личной истории.',url:'/cargos/fixture?publication_expired=1',created_at:'2026-11-11T09:00:00Z'}]}});
    });
    await page.goto(H.BASE);
    await page.evaluate(({session, language}) => {
      localStorage.setItem('ur_reg_token',session.token);
      localStorage.setItem('ur_session',JSON.stringify({user:{id:session.id,role:session.role}}));
      localStorage.setItem('ur_verification_level','2');localStorage.setItem('ur_lang',language);
      localStorage.setItem(`ur_external_feed_first_visit_v1:${session.id}`,'1');
    },{session:sessions[role],language});
    await page.reload();
    await expect(page.getByTestId('bottom-nav-mywork')).toBeVisible({timeout:20000});
    await page.getByTestId('bottom-nav-mywork').click();
    await page.getByTestId('mywork-menu-btn').click();
    await page.getByTestId('profile-notifications').click();
    await expect(page.getByText(title,{exact:true})).toBeVisible();
    const heading = await page.getByTestId('notifications-title').boundingBox();
    const action = await page.getByTestId('notifications-mark-all').boundingBox();
    expect(heading && action).toBeTruthy();
    expect(action.x >= heading.x + heading.width + 8 || action.y >= heading.y + heading.height).toBeTruthy();
  });
}
