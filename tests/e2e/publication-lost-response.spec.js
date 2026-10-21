// Настоящий локальный API сохраняет объявление; браузер теряет именно его ответ.
const { test, expect } = require('@playwright/test');
const { BASE, API, apiEmailToken, openAuthenticated } = require('./helpers/webflow');
if (new URL(BASE).hostname !== '127.0.0.1') throw Error('Этот тест разрешён только на изолированном loopback');
test.use({ serviceWorkers: 'block', video: 'off', trace: 'off' });
for (const [kind, role, action, submit] of [
  ['cargo', 'client', 'mytrips-place-cargo', 'cargo-submit-button'],
  ['trip:unbound', 'driver', 'mytrips-publish-route', 'trip-submit-button'],
]) {
  test(`${kind}: потерянный успешный ответ → restart → один результат`, async ({ page, request }) => {
    const token = await apiEmailToken(request, `lost-${kind.replace(':','-')}-${Date.now()}@example.test`, role);
    const me = await (await request.get(`${API}/register/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const draft = { from: 'Хоргос', fromPoint: null, to: 'Алматы', toPoint: null, truckType: 'tent', tons: '25', m3: '150', price: '4500', currency: 'USD',
      ...(role === 'client' ? { cargoDesc: 'ТЕСТ: электросамокаты', pickupDate: date, currencyTouched: true, paymentType: 'any', photos: [] }
        : { transit: '', departure: date, arrival: '' }) };
    const key = `ur_publication_draft_v1:${encodeURIComponent(kind)}:${encodeURIComponent(me.id)}`;
    await openAuthenticated(page, token, role);
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key, draft });
    async function open() {
      await page.getByTestId('bottom-nav-mywork').click();
      await page.getByTestId(action).click();
      await expect(page.getByTestId(submit)).toBeVisible();
      await expect(page.getByTestId(role === 'client' ? 'cargo-price-field' : 'trip-price-input')).toHaveValue('4500');
    }
    const endpoint = `${API}/market/${role === 'client' ? 'cargos' : 'trips'}`;
    const attempts = []; let original;
    await page.route(endpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push(route.request().postDataJSON());
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const result = await response.json();
      if (!original) { original = result; return route.abort('failed'); }
      expect(result).toEqual(original);
      await route.fulfill({ response });
    });
    await open(); await page.getByTestId(submit).click();
    await expect.poll(() => attempts.length).toBe(1);
    await expect.poll(() => !!original).toBe(true);
    await expect(page.getByTestId(submit)).toBeEnabled();
    const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    expect(persisted._publication.clientId).toBe(attempts[0].client_id);
    expect(persisted._publication.payload).toEqual(attempts[0]);
    await page.reload({ waitUntil: 'networkidle' });
    await open(); await page.getByTestId(submit).click();
    await expect.poll(() => attempts.length).toBe(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    const mine = await (await request.get(`${API}/market/my`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const rows = role === 'client' ? mine.my_cargos : mine.my_trips;
    expect(rows.filter(x => x.id === original.id)).toHaveLength(1);
    expect(rows).toHaveLength(1);
    await test.info().attach('replay-proof', { body: JSON.stringify({ kind, attempts: attempts.length, client_id: attempts[0].client_id, result: original, owned_count: rows.length }), contentType: 'application/json' });
  });
}
