const { test, expect } = require('@playwright/test');
const { BASE, API, apiEmailToken, openAuthenticated } = require('./helpers/webflow');
if (new URL(BASE).hostname !== '127.0.0.1') throw Error('Только изолированный loopback');
test.use({ serviceWorkers: 'block', trace: 'off', video: 'off' });
let token, owner;
test.beforeAll(async ({ request }) => {
  token = await apiEmailToken(request, `date-layout-${Date.now()}@example.test`, 'driver');
  owner = await (await request.get(`${API}/register/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
});
for (const width of [360, 390]) for (const fontScale of [1, 1.6]) for (const theme of ['light', 'dark']) {
  test(`полная дата: ${width}px, шрифт ${fontScale}, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openAuthenticated(page, token, 'driver');
    const departure = '25.10.2026';
    await page.evaluate(({ ownerId, departure, theme }) => {
      localStorage.setItem('ur_theme', theme);
      localStorage.setItem(`ur_publication_draft_v1:trip%3Aunbound:${encodeURIComponent(ownerId)}`, JSON.stringify({ from: 'Алматы', to: 'Астана', departure, truckType: 'tent', tons: '25', m3: '150', price: '4500', currency: 'USD', transit: '', arrival: '' }));
    }, { ownerId: owner.id, departure, theme });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('bottom-nav-mywork').click();
    await page.getByTestId('mytrips-publish-route').click();
    const field = page.getByTestId('trip-departure-field');
    const date = field.getByText(departure, { exact: true });
    await expect(date).toBeVisible();
    if (fontScale !== 1) await page.evaluate(scale => {
      const sizes = [...document.querySelectorAll('[dir="auto"]')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
      for (const [el, font, line] of sizes) {
        el.style.fontSize = `${parseFloat(font) * scale}px`;
        if (line !== 'normal') el.style.lineHeight = `${parseFloat(line) * scale}px`;
      }
    }, fontScale);
    await field.scrollIntoViewIfNeeded();
    const layout = await date.evaluate(el => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { text: el.textContent, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, textOverflow: style.textOverflow, lineClamp: style.webkitLineClamp, width: rect.width, height: rect.height };
    });
    expect(layout.text).toBe(departure);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
    expect(layout.lineClamp).not.toBe('1');
    expect(layout.textOverflow).not.toBe('ellipsis');
    await expect(page.getByTestId('trip-price-input')).toHaveValue('4500');
    await test.info().attach('layout', { body: JSON.stringify(layout), contentType: 'application/json' });
    await page.screenshot({ path: `${process.env.DATE_LAYOUT_EVIDENCE || '/tmp'}/trip-date-${width}-${fontScale}-${theme}.png` });
  });
}
