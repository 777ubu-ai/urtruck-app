/**
 * Controlled live transaction QA: cargo → bid → counter → counter/accept →
 * chat → in_progress → delivered → cleanup.
 *
 * GUARDED: skipped unless RUN_LIVE_DEAL_QA=1 (so a normal `npm run test:e2e`
 * never reaches the production database). The file name ends in `.live.spec.js`
 * so playwright.config.js `testIgnore` already excludes it from default runs.
 *
 * Run:
 *   RUN_LIVE_DEAL_QA=1 E2E_BASE_URL=https://urtruck.kz \
 *     npx playwright test tests/e2e/urtruck-live-deal-flow.live.spec.js
 *
 * Dry-run (no writes — only inspects endpoints exist):
 *   RUN_LIVE_DEAL_QA_DRY=1 E2E_BASE_URL=https://urtruck.kz \
 *     npx playwright test tests/e2e/urtruck-live-deal-flow.live.spec.js
 *
 * Data hygiene:
 *   - All test rows carry a "QA_LIVE_DEAL_<run-id>" tag in cargo_desc / message
 *   - finally{} cancels the deal (if not delivered) and deletes the cargo
 *   - IDs of every created row are logged so they can be inspected later
 */
const { test, expect, request: playwrightRequest } = require('@playwright/test');

const LIVE = process.env.RUN_LIVE_DEAL_QA === '1';
const DRY  = process.env.RUN_LIVE_DEAL_QA_DRY === '1';
const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const API  = `${BASE}/api/v1`;

const RUN_ID = Date.now().toString(36);
const TAG    = `QA_LIVE_DEAL_${RUN_ID}`;

function log(...a) { console.log('[live-deal-qa]', ...a); }

async function newAuthedContext() {
  return playwrightRequest.newContext({ ignoreHTTPSErrors: true });
}

async function guestToken(req, role) {
  const r = await req.post(`${API}/register/guest`, { data: { role } });
  expect(r.ok(), `guest ${role}: ${r.status()}`).toBeTruthy();
  const d = await r.json();
  expect(d.token, `guest ${role}: no token`).toBeTruthy();
  return { token: d.token, userId: d.user_id || d.user?.id };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// ─── DRY-RUN: only verify endpoints respond, do not write. ──────────────────

test.describe('Live deal-flow QA (dry-run)', () => {
  test('endpoints are reachable, no data is created', async () => {
    test.skip(!DRY, 'Dry-run guard. Set RUN_LIVE_DEAL_QA_DRY=1.');
    log(`DRY mode against ${API}`);
    const req = await newAuthedContext();
    try {
      const cargos = await req.get(`${API}/market/cargos?limit=1`);
      expect(cargos.ok(), 'GET /market/cargos').toBeTruthy();
      const trips = await req.get(`${API}/market/trips?limit=1`);
      expect(trips.ok(), 'GET /market/trips').toBeTruthy();
      // GET /market/deals requires auth — check it bounces with 401/403, not 5xx.
      const deals = await req.get(`${API}/market/deals`);
      expect([200, 401, 403]).toContain(deals.status());
      log('dry-run OK');
    } finally {
      await req.dispose();
    }
  });
});

// ─── FULL LIVE FLOW ────────────────────────────────────────────────────────

test.describe('Live deal-flow QA (real transaction)', () => {
  test.setTimeout(180_000);

  test('cargo → bid → counter → counter/accept → in_progress → delivered → cleanup', async () => {
    test.skip(!LIVE, 'Protected. Set RUN_LIVE_DEAL_QA=1 to run against production.');
    if (DRY) test.skip(true, 'Dry-run flag set; full live flow is not executed.');

    log(`⚠️  RUNNING LIVE QA against ${API}`);
    log(`tag = ${TAG}`);

    // Two independent contexts so we can act as two distinct users in parallel.
    const reqShipper = await newAuthedContext();
    const reqDriver  = await newAuthedContext();

    const created = { cargoId: null, bidId: null, dealId: null, chatRoomId: null };
    const finalState = { dealStatus: null, error: null };
    // Hoisted so finally{} can re-use the SAME owner token for cleanup
    // (a fresh guest() would create a different user → 403 on owner-only ops).
    let shipper = null;
    let driver  = null;

    try {
      // ── 1. AUTH: two guest accounts ──────────────────────────────────────
      shipper = await guestToken(reqShipper, 'client');
      driver  = await guestToken(reqDriver, 'driver');
      log('shipper user_id =', shipper.userId);
      log('driver  user_id =', driver.userId);

      // ── 2. shipper creates QA cargo ──────────────────────────────────────
      const cargoBody = {
        from_city: 'Almaty',
        to_city: 'Moscow',
        cargo_desc: `${TAG} pallets`,
        cargo_type: 'general',
        weight_tons: 18,
        volume_m3: 80,
        truck_type: 'tent',
        price: 4000,
        pickup_date: '2026-05-15',
      };
      const cargoR = await reqShipper.post(`${API}/market/cargos`, {
        headers: authHeaders(shipper.token), data: cargoBody,
      });
      expect(cargoR.ok(), `create cargo: ${cargoR.status()}`).toBeTruthy();
      const cargoJson = await cargoR.json();
      expect(cargoJson.id, 'cargo id').toBeTruthy();
      created.cargoId = cargoJson.id;
      log('cargo_id =', created.cargoId);

      // ── 3. driver creates a bid ──────────────────────────────────────────
      const bidR = await reqDriver.post(`${API}/market/bids`, {
        headers: authHeaders(driver.token),
        data: { cargo_id: created.cargoId, amount: 4000, message: `${TAG} initial bid` },
      });
      expect(bidR.ok(), `create bid: ${bidR.status()}`).toBeTruthy();
      const bidJson = await bidR.json();
      expect(bidJson.id, 'bid id').toBeTruthy();
      created.bidId = bidJson.id;
      log('bid_id =', created.bidId);

      // ── 4. shipper sends counter-offer ───────────────────────────────────
      const counterR = await reqShipper.post(`${API}/market/bids/${created.bidId}/counter`, {
        headers: authHeaders(shipper.token),
        data: { amount: 3700, message: `${TAG} counter` },
      });
      expect(counterR.ok(), `counter: ${counterR.status()}`).toBeTruthy();
      const counterJson = await counterR.json();
      expect(counterJson.bid?.status).toBe('countered');
      expect(counterJson.bid?.counter_amount).toBe(3700);

      // ── 5. driver accepts counter-offer ──────────────────────────────────
      const acceptR = await reqDriver.post(
        `${API}/market/bids/${created.bidId}/counter/accept`,
        { headers: authHeaders(driver.token) },
      );
      expect(acceptR.ok(), `counter/accept: ${acceptR.status()}`).toBeTruthy();
      const acceptJson = await acceptR.json();
      expect(acceptJson.deal_id, 'deal_id').toBeTruthy();
      expect(acceptJson.chat_room_id, 'chat_room_id').toBeTruthy();
      expect(acceptJson.amount).toBe(3700);
      created.dealId = acceptJson.deal_id;
      created.chatRoomId = acceptJson.chat_room_id;
      log('deal_id =', created.dealId, 'chat_room_id =', created.chatRoomId);

      // ── 6. verify deal exists with correct fields ────────────────────────
      const dealR = await reqDriver.get(`${API}/market/deals/${created.dealId}`, {
        headers: authHeaders(driver.token),
      });
      expect(dealR.ok(), `get deal: ${dealR.status()}`).toBeTruthy();
      const deal = await dealR.json();
      expect(deal.status).toBe('accepted');
      expect(deal.amount).toBe(3700);
      expect(deal.cargo_id).toBe(created.cargoId);
      expect(deal.bid_id).toBe(created.bidId);
      expect(deal.chat_room_id).toBe(created.chatRoomId);

      // ── 7. driver opens / verifies chat room (no message sent) ──────────
      const openChatR = await reqDriver.post(`${API}/market/bids/${created.bidId}/chat`, {
        headers: authHeaders(driver.token),
      });
      // After accept the bid is no longer pending/countered, so this endpoint
      // returns 409 — that's expected and proves the guard works. We already
      // have chat_room_id from the deal itself.
      expect([200, 409]).toContain(openChatR.status());

      // ── 8. driver moves deal to in_progress ──────────────────────────────
      const startR = await reqDriver.fetch(
        `${API}/market/deals/${created.dealId}/status?new_status=in_progress`,
        { method: 'PATCH', headers: authHeaders(driver.token) },
      );
      expect(startR.ok(), `→ in_progress: ${startR.status()}`).toBeTruthy();
      const startJson = await startR.json();
      expect(startJson.status).toBe('in_progress');

      // ── 9. shipper marks delivered ───────────────────────────────────────
      const deliverR = await reqShipper.fetch(
        `${API}/market/deals/${created.dealId}/status?new_status=delivered`,
        { method: 'PATCH', headers: authHeaders(shipper.token) },
      );
      expect(deliverR.ok(), `→ delivered: ${deliverR.status()}`).toBeTruthy();
      const deliverJson = await deliverR.json();
      expect(deliverJson.status).toBe('delivered');

      // ── 10. final verify ─────────────────────────────────────────────────
      const finalR = await reqShipper.get(`${API}/market/deals/${created.dealId}`, {
        headers: authHeaders(shipper.token),
      });
      expect(finalR.ok()).toBeTruthy();
      const finalDeal = await finalR.json();
      expect(finalDeal.status).toBe('delivered');
      finalState.dealStatus = finalDeal.status;

      log('flow OK; final deal status =', finalDeal.status);
    } catch (e) {
      finalState.error = e?.message || String(e);
      throw e;
    } finally {
      log('cleanup begin', { ...created, ...finalState });

      // Best-effort cleanup. If the flow already reached `delivered`, the deal
      // status is terminal and cargo.status is `completed` — leave it as-is
      // (audit will see the QA_LIVE_DEAL_ tag). Otherwise try to flip the deal
      // to `cancelled` so cargo bounces back to `active` and can be deleted.
      try {
        if (created.dealId && finalState.dealStatus !== 'delivered' && shipper?.token) {
          const cancelR = await reqShipper.fetch(
            `${API}/market/deals/${created.dealId}/status?new_status=cancelled`,
            { method: 'PATCH', headers: authHeaders(shipper.token) },
          ).catch(() => null);
          log('cleanup cancel deal status =', cancelR ? cancelR.status() : 'skipped');
        }
        if (created.cargoId && shipper?.token) {
          // DELETE /cargos/{id} flips cargo.status='cancelled' (soft delete).
          const delR = await reqShipper.delete(`${API}/market/cargos/${created.cargoId}`, {
            headers: authHeaders(shipper.token),
          }).catch(() => null);
          log('cleanup cargo delete status =', delR ? delR.status() : 'skipped');
        }
      } catch (e) {
        log('cleanup error (non-fatal):', e?.message || e);
      }

      log('cleanup end');
      await reqShipper.dispose();
      await reqDriver.dispose();
    }
  });
});

