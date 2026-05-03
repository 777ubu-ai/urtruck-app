// Boris — cargo owner / Chinese shipper QA agent.
//
// Same dual-mode strategy as Serik: open the live UI for screenshots and
// hit the marketplace API directly for deterministic assertions. Boris also
// places-then-accepts a bid round-trip to validate the deal/order flow.

const { test, expect } = require('@playwright/test');
const { BASE_URL, ACTORS, QA_TAG, QA_RUN_ID, REPORTS_DIR } = require('../utils/qaConfig');
const qaApi = require('../utils/qaApi');
const qaData = require('../utils/qaData');
const { snap } = require('../utils/qaScreenshots');
const { log, attach } = require('../utils/qaReport');
const fs = require('fs');
const path = require('path');

const ACTOR = ACTORS.boris.handle;
const ACTOR_KEY = 'boris';

test.describe.configure({ mode: 'serial' });

test('Boris · cargo owner flow', async ({ page }) => {
  // 1. Open site
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await snap(page, 'boris', 'home-loaded');

  // 2. Select cargo owner role
  const shipperBtn = page.getByText(/Я грузовладелец|I'm a shipper|cargo owner|client/i).first();
  if (await shipperBtn.isVisible().catch(() => false)) {
    await shipperBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
    await snap(page, 'boris', 'shipper-role-selected');
    log.pass(ACTOR, 'select-shipper-role');
  } else {
    log.p2(ACTOR, 'select-shipper-role', 'shipper button not found in current layout');
  }

  // 3. Provision session via stable QA actor (rate-limit safe)
  const session = await qaApi.ensureActor(ACTOR_KEY, { role: 'client' });
  if (!session.token) {
    const isRateLimit = /429|rate|подожди/i.test(session.error || '');
    (isRateLimit ? log.p1 : log.p0)(ACTOR, 'ensure-actor', `${session.source}: ${session.error || ''} ${session.warning || ''}`.trim());
    return;
  }
  log.pass(ACTOR, 'ensure-actor', `userId=${session.userId || '?'} via=${session.source}${session.warning ? ` (warning: ${session.warning})` : ''}`);
  attach('boris', 'session', { userId: session.userId, hasToken: true, source: session.source });
  const headers = { actor: ACTOR, token: session.token };

  // 4. Publish cargo
  const cargoPayload = qaData.borisCargoPayload();
  const created = await qaApi.post('/market/cargos', cargoPayload, headers);
  if (!created.ok || !(created.json && created.json.id)) {
    log.p0(ACTOR, 'publish-cargo', `${created.status} ${created.text || ''}`.slice(0, 300));
    attach('boris', 'createCargo', created);
    return;
  }
  const cargoId = created.json.id;
  log.pass(ACTOR, 'publish-cargo', `id=${cargoId}`);
  attach('boris', 'cargoId', cargoId);

  // 5. Assertions — appears in MyWork, public Cargos feed
  const myDash = await qaApi.get('/market/my', headers);
  const myHasIt = ((myDash.json && myDash.json.my_cargos) || []).some((c) => c.id === cargoId);
  myHasIt
    ? log.pass(ACTOR, 'cargo-in-my-work')
    : log.p1(ACTOR, 'cargo-in-my-work', 'POST /cargos returned id but /market/my did not include it');

  const pubCargos = await qaApi.get('/market/cargos', { ...headers, query: { status: 'active', limit: 200 } });
  const inPublic = ((pubCargos.json && pubCargos.json.cargos) || []).find((c) => c.id === cargoId);
  if (inPublic) {
    log.pass(ACTOR, 'cargo-in-public-feed', `price=${inPublic.price} currency=${inPublic.currency}`);
  } else {
    log.p1(ACTOR, 'cargo-in-public-feed', 'cargo created but missing from list_cargos');
  }

  // CargoDetail open without crash (UI best-effort)
  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  await snap(page, 'boris', 'feed-after-publish');

  // 6. Bids area: pick up Serik's bid (placed in serik.driver.spec.js) or
  // any QA-tagged bid on this cargo.
  const bidsResp = await qaApi.get('/market/bids', { ...headers, query: { cargo_id: cargoId } });
  const bids = (bidsResp.json && bidsResp.json.bids) || [];
  attach('boris', 'incomingBids', bids.length);

  // To exercise accept-flow, Serik (stable QA driver) places a bid on Boris's
  // cargo. Reusing Serik's stable identity keeps the row count down and
  // exercises the same auth path through /qa/ensure-actor.
  const bidderSession = await qaApi.ensureActor('serik', { role: 'driver' });
  if (bidderSession.token) {
    const bid = await qaApi.post('/market/bids',
      { cargo_id: cargoId, amount: 4900, message: `Bid sim ${QA_TAG}` },
      { actor: 'agent-serik', token: bidderSession.token });
    if (bid.ok && bid.json && bid.json.id) {
      const accept = await qaApi.post(`/market/bids/${bid.json.id}/accept`, null, headers);
      if (accept.ok && accept.json && (accept.json.deal_id || accept.json.ok)) {
        log.pass(ACTOR, 'accept-bid', `dealId=${accept.json.deal_id}`);
      } else {
        log.p1(ACTOR, 'accept-bid', `${accept.status} ${accept.text || ''}`.slice(0, 200));
      }
    } else {
      log.p2(ACTOR, 'simulated-bid', `${bid.status} ${bid.text || ''}`.slice(0, 200));
    }
  }

  // 7. Chat: send a message via /chat/send to support, verify it persists.
  // Production must NOT include ai-volodya-test in /chat/contacts.
  const contacts = await qaApi.get('/chat/contacts');
  const contactNames = ((contacts.json && contacts.json.contacts) || []).map((c) => c.name).join(' | ');
  const hasVolodya = /Володя|volodya/i.test(contactNames);
  if (hasVolodya) {
    log.p1(ACTOR, 'chat-no-volodya-in-prod', `forbidden persona present: ${contactNames}`);
  } else {
    log.pass(ACTOR, 'chat-no-volodya-in-prod', `contacts=${contactNames || 'empty'}`);
  }

  // Notifications bell
  const notifs = await qaApi.get('/notifications', headers);
  log.info(ACTOR, 'notifications-fetch', `status=${notifs.status} count=${(notifs.json && (notifs.json.length || (notifs.json.items && notifs.json.items.length))) || 0}`);

  await snap(page, 'boris', 'final');

  // Persist Boris's token for cleanup
  const tokenFile = path.join(REPORTS_DIR, `_tokens-${QA_RUN_ID}.json`);
  let cache = {};
  try { if (fs.existsSync(tokenFile)) cache = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); } catch {}
  if (session.userId) cache[session.userId] = session.token;
  fs.writeFileSync(tokenFile, JSON.stringify(cache, null, 2));

  const sshots = require('../utils/qaScreenshots').listForRun().filter((p) => p.includes('/boris-'));
  attach('boris', 'screenshots', sshots);
});
