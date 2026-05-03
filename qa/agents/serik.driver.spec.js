// Serik — Kazakhstan driver QA agent.
//
// Strategy: stays headless against the live web bundle. Where UI clicks
// would be brittle (publish-form selectors / role-card variants per build),
// Serik also calls the same backend endpoints the UI calls and asserts
// against the API directly. Every UI step still produces a screenshot for
// the Auditor's report.

const { test, expect } = require('@playwright/test');
const { BASE_URL, ACTORS, QA_TAG, QA_RUN_ID } = require('../utils/qaConfig');
const qaApi = require('../utils/qaApi');
const qaData = require('../utils/qaData');
const { snap } = require('../utils/qaScreenshots');
const { log, attach } = require('../utils/qaReport');

const ACTOR = ACTORS.serik.handle;
const ACTOR_KEY = 'serik';

test.describe.configure({ mode: 'serial' });

test('Serik · driver flow', async ({ page }) => {
  // 1. Open site
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await snap(page, 'serik', 'home-loaded');

  // 2. Select driver role (UI; falls back gracefully if Welcome layout shifts)
  const driverBtn = page.getByText(/Я водитель|I'm a driver|carrier|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
    await snap(page, 'serik', 'driver-role-selected');
    log.pass(ACTOR, 'select-driver-role');
  } else {
    log.p2(ACTOR, 'select-driver-role', 'driver button not found in current layout — may be already inside the app');
  }

  // 3. Provision a session. Prefer the protected /qa/ensure-actor endpoint
  // (no rate-limit, stable user-id between runs). Falls back to /register/guest
  // when QA_AGENT_TOKEN isn't configured.
  const session = await qaApi.ensureActor(ACTOR_KEY, { role: 'driver' });
  if (!session.token) {
    // 429 on the public fallback is QA-infra (rate limit), not a product
    // failure. Surface as P1 so the report doesn't drown in fake P0s.
    const isRateLimit = /429|rate|подожди/i.test(session.error || '');
    const fn = isRateLimit ? log.p1 : log.p0;
    fn(ACTOR, 'ensure-actor', `${session.source}: ${session.error || ''} ${session.warning || ''}`.trim());
    attach('serik', 'session', session);
    return;
  }
  log.pass(ACTOR, 'ensure-actor', `userId=${session.userId || '?'} via=${session.source}${session.warning ? ` (warning: ${session.warning})` : ''}`);
  attach('serik', 'session', { userId: session.userId, hasToken: true, source: session.source });

  const headers = { actor: ACTOR, token: session.token };

  // 4. Publish route via API (UI fallback covered by smoke tests)
  const tripPayload = qaData.serikTripPayload();
  const created = await qaApi.post('/market/trips', tripPayload, headers);
  if (!created.ok || !(created.json && created.json.id)) {
    log.p0(ACTOR, 'publish-trip', `${created.status} ${created.text || ''}`.slice(0, 300));
    attach('serik', 'createTrip', created);
    return;
  }
  const tripId = created.json.id;
  log.pass(ACTOR, 'publish-trip', `id=${tripId}`);
  attach('serik', 'tripId', tripId);

  // 5. Assertions: appears in MyTrips, public Trips feed, price visible
  const myDash = await qaApi.get('/market/my', headers);
  const myHasIt = ((myDash.json && myDash.json.my_trips) || []).some((t) => t.id === tripId);
  myHasIt
    ? log.pass(ACTOR, 'trip-in-my-work')
    : log.p1(ACTOR, 'trip-in-my-work', 'POST /market/trips returned id but /market/my did not include it');

  // Public list can lag a beat behind POST /market/trips when WAL write is
  // still flushing. Poll up to 5×1s before giving up — way better than a
  // flaky P1 in the report.
  let inPublic = null;
  for (let attempt = 1; attempt <= 5 && !inPublic; attempt++) {
    const pubTrips = await qaApi.get('/market/trips', { ...headers, query: { status: 'active', limit: 200 } });
    inPublic = ((pubTrips.json && pubTrips.json.trips) || []).find((t) => t.id === tripId);
    if (!inPublic) await new Promise((r) => setTimeout(r, 1000));
  }
  if (inPublic) {
    log.pass(ACTOR, 'trip-in-public-feed', `price=${inPublic.price} currency=${inPublic.currency}`);
  } else {
    log.p1(ACTOR, 'trip-in-public-feed', 'trip created but missing from list_trips response after 5×1s polling');
  }

  // Detail open via UI (best effort)
  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  await snap(page, 'serik', 'feed-after-publish');

  // 6. Edit route price 12000 → 13000
  const patched = await qaApi.patch(`/market/trips/${tripId}`, qaData.serikTripEditPayload(), headers);
  if (patched.ok) {
    log.pass(ACTOR, 'edit-trip', `→ price=${patched.json && patched.json.trip && patched.json.trip.price}`);
  } else {
    // PATCH endpoint may not be deployed yet — that's a known fix on the way,
    // mark as P1 not P0.
    log.p1(ACTOR, 'edit-trip', `PATCH /trips/${tripId} → ${patched.status} ${patched.text || ''}`.slice(0, 200));
  }

  const tripAfter = await qaApi.get(`/market/trips/${tripId}`);
  if (tripAfter.json && tripAfter.json.price === 13000) {
    log.pass(ACTOR, 'edit-trip-visible', 'price=13000 confirmed');
  } else if (patched.ok) {
    log.p1(ACTOR, 'edit-trip-visible', `expected 13000, got ${tripAfter.json && tripAfter.json.price}`);
  }
  attach('serik', 'createTrip', { id: tripId, after: tripAfter.json });

  // 7. Search "тнт" — UI hardness check (no crash); we just navigate and snap
  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  await snap(page, 'serik', 'feed-search-test');

  // 8. If clean cargo exists (Boris hasn't run yet — that's fine, will be
  // covered later), pick the first non-QA cargo and place a bid.
  const cargos = await qaApi.get('/market/cargos', { ...headers, query: { status: 'active', limit: 50 } });
  const cleanCargo = ((cargos.json && cargos.json.cargos) || []).find((c) =>
    !/\[ar-/.test(`${c.cargo_desc || ''}${c.from_city || ''}${c.to_city || ''}`)
  );
  if (cleanCargo) {
    const bid = await qaApi.post('/market/bids',
      qaData.serikBidPayload(cleanCargo.id),
      headers);
    if (bid.ok && bid.json && bid.json.ok) {
      log.pass(ACTOR, 'place-bid', `cargo=${cleanCargo.id} bidId=${bid.json.id}`);
      attach('serik', 'bidId', bid.json.id);
    } else {
      log.p1(ACTOR, 'place-bid', `${bid.status} ${bid.text || ''}`.slice(0, 200));
    }
  } else {
    log.info(ACTOR, 'place-bid', 'no clean public cargo to bid on — skipped');
  }

  // Persist Serik's token so qa:cleanup can DELETE/PATCH as the original owner.
  const fs = require('fs');
  const path = require('path');
  const { REPORTS_DIR } = require('../utils/qaConfig');
  const tokenFile = path.join(REPORTS_DIR, `_tokens-${QA_RUN_ID}.json`);
  let cache = {};
  try { if (fs.existsSync(tokenFile)) cache = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); } catch {}
  if (session.userId) cache[session.userId] = session.token;
  fs.writeFileSync(tokenFile, JSON.stringify(cache, null, 2));

  // Capture all screenshots into report state for the Auditor.
  const sshots = require('../utils/qaScreenshots').listForRun().filter((p) => p.includes('/serik-'));
  attach('serik', 'screenshots', sshots);
});
