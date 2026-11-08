// Current mandatory Deal MVP E2E.
//
// The old test targeted deleted Orders/Profile navigation and carried a
// skipped Chinese case. This test uses the real local beta backend and a
// fresh SQLite database: a shipper publishes a cargo, a driver bids, the
// shipper accepts, and the current Deals tab opens the exact resulting deal.
// No request is mocked and no external environment is contacted.
const { test, expect } = require('@playwright/test');
const H = require('./helpers/webflow');

const RUN = Date.now().toString(36);

async function actor(request, email, role) {
  const token = await H.apiEmailToken(request, email, role);
  const response = await request.get(`${H.API}/register/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const me = await response.json();
  expect(me.role).toBe(role);
  return { token, id: me.id, role };
}

async function openAs(page, session) {
  await page.goto(H.BASE, { waitUntil: 'networkidle' });
  await page.evaluate(({ token, id, role }) => {
    localStorage.setItem('ur_reg_token', token);
    localStorage.setItem('ur_verification_level', '2');
    localStorage.setItem('ur_session', JSON.stringify({ user: { id, role, phone: null } }));
  }, session);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator(H.tid('bottom-nav'))).toBeVisible({ timeout: 20000 });
}

test.describe('Deal MVP — current local beta flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('shipper cargo → driver bid → accept creates one deal and current Deals opens it', async ({ page, request }) => {
    const shipper = await actor(request, `deal-shipper-${RUN}@urtruck.qa`, 'client');
    const driver = await actor(request, `deal-driver-${RUN}@urtruck.qa`, 'driver');

    const cargo = await H.apiCreateCargo(request, shipper.token, {
      cargo_desc: `E2E deal cargo ${RUN}`,
      price: 420000,
      currency: 'KZT',
    });
    expect(cargo.status).toBeLessThan(300);
    const cargoId = cargo.body.id;
    expect(cargoId).toBeTruthy();

    const bid = await H.apiCreateBid(request, driver.token, cargoId, 400000);
    expect(bid.status).toBeLessThan(300);
    const bidId = bid.body.id;
    expect(bidId).toBeTruthy();

    const accepted = await request.post(`${H.API}/market/bids/${bidId}/accept`, {
      headers: { Authorization: `Bearer ${shipper.token}` },
    });
    expect(accepted.status()).toBeLessThan(300);
    const acceptedBody = await accepted.json();
    const dealId = acceptedBody.deal_id || acceptedBody.id || acceptedBody.deal?.id;
    expect(dealId).toBeTruthy();

    const dealsResponse = await request.get(`${H.API}/market/deals`, {
      headers: { Authorization: `Bearer ${driver.token}` },
    });
    expect(dealsResponse.status()).toBe(200);
    const dealsBody = await dealsResponse.json();
    const deals = Array.isArray(dealsBody) ? dealsBody : (dealsBody.deals || []);
    expect(deals.filter((deal) => deal.id === dealId)).toHaveLength(1);
    expect(deals.find((deal) => deal.id === dealId)?.chat_room_id).toBeTruthy();

    await openAs(page, driver);
    await page.locator(H.tid('bottom-nav-deals')).click();
    await page.locator(H.tid('deals-tab-active')).click();
    const card = page.locator(H.tid('deals-deal-card')).filter({ hasText: '400' });
    await expect(card).toHaveCount(1, { timeout: 15000 });
    await card.click();
    await expect(page.locator(H.tid('deal-workspace-screen'))).toBeVisible({ timeout: 15000 });
    await expect(page.locator(H.tid('deal-chat-composer-dock'))).toBeVisible();
  });
});
