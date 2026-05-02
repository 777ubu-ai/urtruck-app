/**
 * Safe live data audit/cleanup. PROTECTED:
 *   - skipped unless process.env.RUN_QA_CLEANUP === '1'
 *   - destructive phase only with RUN_QA_CLEANUP=1 CLEANUP_CONFIRM=1
 *   - file is *.live.spec.js so playwright.config testIgnore excludes it from
 *     default `npm run test:e2e`. The same env var also flips testIgnore in
 *     the config (RUN_LIVE_DEAL_QA family).
 *
 * Run audit-only:
 *   RUN_QA_CLEANUP=1 E2E_BASE_URL=https://urtruck.kz \
 *     npx playwright test tests/e2e/urtruck-safe-data-cleanup.live.spec.js
 *
 * Run audit + cleanup of records the test owns OR explicit safe cancels:
 *   RUN_QA_CLEANUP=1 CLEANUP_CONFIRM=1 E2E_BASE_URL=https://urtruck.kz \
 *     npx playwright test tests/e2e/urtruck-safe-data-cleanup.live.spec.js
 *
 * NOTE on permissions:
 *   The public marketplace API only exposes /market/cargos and /market/trips
 *   listings; there is NO endpoint that returns ALL users or ALL deals. We
 *   can audit suspicious cargos/trips by their text fields, but for cleanup
 *   we may only act on records the test itself authenticated against (e.g.
 *   freshly seeded demo users). Records owned by *other* old guests stay
 *   untouched — the audit just classifies them. This is reported.
 */
const { test, expect, request: pwRequest } = require('@playwright/test');

const ENABLED  = process.env.RUN_QA_CLEANUP === '1';
const CONFIRM  = process.env.CLEANUP_CONFIRM === '1';
const BASE     = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const API      = `${BASE}/api/v1`;

const SUSP_RE = /(QA_AGENT_|QA_LIVE_DEAL_|QA_DEMO_|test|demo|Тестер|Тест |Тест$|Володя|Volodya|^Водитель$|Баг|Bug|guest_)/i;
// Endonyms / common bot fixtures that we *never* delete — special-purpose.
const NEVER_DELETE_NAME = /UrTruck Support|Володя|Volodya|UrTruck/;

function log(...a) { console.log('[qa-cleanup]', ...a); }

function classify(rec, kind) {
  // rec = cargo or trip
  const txt = [rec.cargo_desc, rec.owner_name, rec.owner_phone, rec.driver_name, rec.driver_phone, rec.from_city, rec.to_city, rec.transit].filter(Boolean).join(' | ');
  if (!SUSP_RE.test(txt)) return null;
  if (NEVER_DELETE_NAME.test(txt)) {
    return { action: 'C_DO_NOT_DELETE_KEEP_HISTORY', reason: 'special-purpose user/bot' };
  }
  // Active = candidate to cancel
  if (rec.status === 'active') {
    return { action: 'A_DELETE_OR_HIDE_SAFE', reason: `active ${kind} with QA tag — safe to cancel via DELETE/PATCH` };
  }
  if (rec.status === 'taken' || rec.status === 'booked' || rec.status === 'in_transit' || rec.status === 'in_progress') {
    return { action: 'B_ARCHIVE_ONLY', reason: `${kind} mid-flight — cancel deal first then mark; risky` };
  }
  if (rec.status === 'completed' || rec.status === 'delivered' || rec.status === 'cancelled') {
    return { action: 'C_DO_NOT_DELETE_KEEP_HISTORY', reason: `terminal ${kind} status — keep for audit trail` };
  }
  return { action: 'B_ARCHIVE_ONLY', reason: `${kind} unknown status="${rec.status}"` };
}

// ─── PHASE 1: AUDIT (always runs when ENABLED) ──────────────────────────────

test.describe('Safe live data audit', () => {
  test.setTimeout(180_000);

  test('audit suspicious test/demo data — read-only', async () => {
    test.skip(!ENABLED, 'Protected. Set RUN_QA_CLEANUP=1 to run.');
    const req = await pwRequest.newContext({ ignoreHTTPSErrors: true });
    try {
      // 1. cargos
      const cR = await req.get(`${API}/market/cargos?limit=200`);
      expect(cR.ok()).toBeTruthy();
      const cargos = (await cR.json()).cargos || [];
      log(`fetched ${cargos.length} cargos (status=active default)`);

      // 2. trips
      const tR = await req.get(`${API}/market/trips?limit=200`);
      expect(tR.ok()).toBeTruthy();
      const trips = (await tR.json()).trips || [];
      log(`fetched ${trips.length} trips (status=active default)`);

      // 3. drivers (approved)
      const dR = await req.get(`${API}/market/drivers`);
      const drivers = dR.ok() ? ((await dR.json()).drivers || []) : [];
      log(`fetched ${drivers.length} approved drivers`);

      // 4. classify
      const suspCargos = [];
      for (const c of cargos) {
        const cl = classify(c, 'cargo');
        if (cl) suspCargos.push({ ...c, _class: cl });
      }
      const suspTrips = [];
      for (const t of trips) {
        const cl = classify(t, 'trip');
        if (cl) suspTrips.push({ ...t, _class: cl });
      }
      const suspDrivers = drivers.filter(d => d.full_name && SUSP_RE.test(d.full_name));

      // 5. group by user
      const userMap = new Map();
      function bump(uid, name, role, kind, status, classCode) {
        if (!uid) return;
        const e = userMap.get(uid) || {
          user_id: uid, display_name: name || '—', role: role || '—',
          cargos: 0, trips: 0, bids: 0, deals: 0, chats: 0, reviews: 0,
          active: 0, terminal: 0, classes: new Set(),
        };
        e[kind === 'cargo' ? 'cargos' : 'trips']++;
        if (status === 'active') e.active++;
        if (['completed','delivered','cancelled','rejected'].includes(status)) e.terminal++;
        e.classes.add(classCode);
        if (e.display_name === '—' && name) e.display_name = name;
        userMap.set(uid, e);
      }
      for (const c of suspCargos) bump(c.owner_id, c.owner_name, 'shipper', 'cargo', c.status, c._class.action);
      for (const t of suspTrips)  bump(t.driver_id, t.driver_name, 'driver',  'trip',  t.status, t._class.action);

      const users = [...userMap.values()].sort((a, b) => (b.cargos + b.trips) - (a.cargos + a.trips));

      // 6. Print report
      log(`\nSUSPICIOUS USERS (${users.length}):`);
      for (const u of users) {
        const acts = [...u.classes].join(',');
        log(`  user=${u.user_id}  role=${u.role}  name="${u.display_name}"  cargos=${u.cargos} trips=${u.trips}  active=${u.active}  terminal=${u.terminal}  rec=${acts}`);
      }
      log(`\nSUSPICIOUS CARGOS (${suspCargos.length}):`);
      for (const c of suspCargos.slice(0, 50)) {
        log(`  cargo=${c.id}  owner=${c.owner_id}  desc="${(c.cargo_desc||'').slice(0,80)}"  status=${c.status}  rec=${c._class.action}`);
      }
      log(`\nSUSPICIOUS TRIPS (${suspTrips.length}):`);
      for (const t of suspTrips.slice(0, 50)) {
        log(`  trip=${t.id}  driver=${t.driver_id}  ${t.from_city}→${t.to_city}  status=${t.status}  rec=${t._class.action}`);
      }
      log(`\nSUSPICIOUS APPROVED DRIVERS (${suspDrivers.length}):`);
      for (const d of suspDrivers.slice(0, 50)) {
        log(`  driver=${d.id}  name="${d.full_name}"  vehicle=${d.vehicle_type||'—'}`);
      }

      // Summary class buckets
      const aCount = suspCargos.filter(x => x._class.action === 'A_DELETE_OR_HIDE_SAFE').length
                   + suspTrips.filter(x => x._class.action === 'A_DELETE_OR_HIDE_SAFE').length;
      const bCount = suspCargos.filter(x => x._class.action === 'B_ARCHIVE_ONLY').length
                   + suspTrips.filter(x => x._class.action === 'B_ARCHIVE_ONLY').length;
      const cCount = suspCargos.filter(x => x._class.action === 'C_DO_NOT_DELETE_KEEP_HISTORY').length
                   + suspTrips.filter(x => x._class.action === 'C_DO_NOT_DELETE_KEEP_HISTORY').length;
      log(`\nCLASS SUMMARY: A=${aCount}  B=${bCount}  C=${cCount}`);

      // Persist for the cleanup phase to consume.
      const fs = require('fs');
      const path = require('path');
      const out = path.resolve(__dirname, '..', '..', 'test-results', 'qa-cleanup-audit.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ users, suspCargos, suspTrips, suspDrivers, aCount, bCount, cCount }, null, 2));
      log(`audit JSON saved → ${out}`);

      // No assertions in audit phase — informational only. Test passes if API
      // responded; suspicious data is reported, not failed on.
      expect(cargos.length + trips.length).toBeGreaterThan(0);
    } finally {
      await req.dispose();
    }
  });
});

// ─── PHASE 3: CLEANUP (only with CONFIRM) ───────────────────────────────────

test.describe('Safe live data cleanup (confirmed only)', () => {
  test.setTimeout(180_000);

  test('cleanup tries to cancel only A-class records that we own; otherwise reports', async () => {
    test.skip(!ENABLED || !CONFIRM, 'Protected. Set RUN_QA_CLEANUP=1 CLEANUP_CONFIRM=1.');
    const req = await pwRequest.newContext({ ignoreHTTPSErrors: true });
    try {
      // Without an admin endpoint, we cannot impersonate the OLD owners.
      // We can ONLY mark/cancel records that this test session owns.
      // For other QA leftovers we just report what would need admin access.
      log('Cleanup phase: this script can only act as freshly-issued guest tokens.');
      log('Old QA leftovers owned by other guest accounts can not be cancelled by us.');
      log('Reporting the audit JSON for an admin to process if needed.');
      // No mutating action — emit honest skip/log output.
      const fs = require('fs');
      const path = require('path');
      const auditFile = path.resolve(__dirname, '..', '..', 'test-results', 'qa-cleanup-audit.json');
      if (!fs.existsSync(auditFile)) {
        log('No prior audit file. Run audit phase first.');
        return;
      }
      const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
      log(`Would request admin cleanup for: A=${audit.aCount} cargos+trips`);
      log('Recommended admin steps:');
      log('  1) For each A-record: PATCH cargos.status=cancelled OR market/cargos/{id} DELETE');
      log('     But only as the owner. Without admin endpoint, requires DB access.');
      log('  2) For each B-record: cancel deal first, then archive.');
      log('  3) Leave C-records as-is.');
    } finally {
      await req.dispose();
    }
  });
});

// ─── PHASE 4: CLEAN DEMO SEED Berik/Serik ───────────────────────────────────

test.describe('Berik/Serik demo seed', () => {
  test.setTimeout(180_000);

  test('seed 3 cargos / 3 trips / 2 completed deals with reviews', async () => {
    test.skip(!ENABLED || !CONFIRM, 'Protected. Set RUN_QA_CLEANUP=1 CLEANUP_CONFIRM=1.');

    const TS = Date.now().toString(36);
    const TAG = `QA_DEMO_BERIK_SERIK_${TS}`;
    log('seed tag =', TAG);
    const req = await pwRequest.newContext({ ignoreHTTPSErrors: true });
    const created = { berik: null, serik: null, cargos: [], trips: [], deals: [], chats: [], reviews: [] };
    try {
      // Two distinct contexts not strictly needed for API — same client OK.
      const guest = async (role) => {
        const r = await req.post(`${API}/register/guest`, { data: { role } });
        const d = await r.json();
        return { token: d.token, id: d.user_id };
      };
      const serik = await guest('client');
      const berik = await guest('driver');
      created.serik = serik.id;
      created.berik = berik.id;
      log('serik =', serik.id, '  berik =', berik.id);

      const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });
      const post = (p, body, t) =>
        req.post(`${API}${p}`, { ...auth(t), data: body, headers: { ...auth(t).headers, 'Content-Type': 'application/json' } });
      const patch = (p, t) => req.fetch(`${API}${p}`, { method: 'PATCH', headers: auth(t).headers });

      // 3 cargos by Serik.
      for (let i = 1; i <= 3; i++) {
        const r = await post('/market/cargos', {
          from_city: 'Almaty', to_city: ['Astana','Karaganda','Shymkent'][i-1],
          cargo_desc: `${TAG} cargo #${i}`,
          cargo_type: 'general', weight_tons: 18, volume_m3: 80,
          truck_type: 'tent', price: 4000 + i*100, pickup_date: '2026-05-15',
        }, serik.token);
        const d = await r.json();
        created.cargos.push(d.id);
      }
      log('cargos:', created.cargos);

      // 3 trips by Berik.
      for (let i = 1; i <= 3; i++) {
        const r = await post('/market/trips', {
          from_city: 'Almaty', to_city: ['Astana','Karaganda','Shymkent'][i-1],
          truck_type: 'tent', capacity_tons: 20, available_m3: 82,
          price: 3800 + i*50, departure: '2026-05-16', arrival: '2026-05-18',
        }, berik.token);
        const d = await r.json();
        created.trips.push(d.id);
      }
      log('trips:', created.trips);

      // 2 completed deals through bid/counter/accept/in_progress/delivered.
      for (let i = 0; i < 2; i++) {
        const cargoId = created.cargos[i];
        // bid
        const bidR = await post('/market/bids', { cargo_id: cargoId, amount: 4100 + i*100, message: `${TAG} bid #${i+1}` }, berik.token);
        const bid = await bidR.json();
        // counter (Serik wants 100 less)
        await post(`/market/bids/${bid.id}/counter`, { amount: 4000 + i*100, message: `${TAG} counter` }, serik.token);
        // accept counter
        const accR = await post(`/market/bids/${bid.id}/counter/accept`, {}, berik.token);
        const acc = await accR.json();
        const dealId = acc.deal_id;
        const roomId = acc.chat_room_id;
        created.deals.push(dealId);
        created.chats.push(roomId);

        // 4 chat messages.
        const chatPost = async (text, fromToken, toUserId) =>
          post('/chat/send', { to_user_id: toUserId, text, cargo_id: cargoId }, fromToken);
        await chatPost(`${TAG} Серик: груз готов, грузим в 15:00`, serik.token, berik.id);
        await chatPost(`${TAG} Берик: принял, выезжаю`, berik.token, serik.id);
        await chatPost(`${TAG} Серик: адрес ул. Сейфуллина 123`, serik.token, berik.id);
        await chatPost(`${TAG} Берик: на месте, разгружаюсь`, berik.token, serik.id);

        // Lifecycle: in_progress (driver), then delivered (shipper).
        await patch(`/market/deals/${dealId}/status?new_status=in_progress`, berik.token);
        await patch(`/market/deals/${dealId}/status?new_status=delivered`,   serik.token);

        // Two reviews each direction.
        const sR = await post('/reviews', { target_id: berik.id, target_role: 'driver', rating: 5, text: `${TAG} S→B` }, serik.token);
        const dR = await post('/reviews', { target_id: serik.id, target_role: 'client', rating: 5, text: `${TAG} B→S` }, berik.token);
        created.reviews.push((await sR.json()).id, (await dR.json()).id);
      }

      log('FINAL:');
      log(JSON.stringify(created, null, 2));
      // Verify last deal is delivered.
      const lastDeal = await req.get(`${API}/market/deals/${created.deals[created.deals.length - 1]}`, auth(serik.token));
      const ld = await lastDeal.json();
      expect(ld.status).toBe('delivered');
    } finally {
      await req.dispose();
    }
  });
});
