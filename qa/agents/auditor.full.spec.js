// Auditor — supervisor QA agent.
//
// Reads everything Serik and Boris recorded in the shared state file, runs
// independent public-API checks, scans for forbidden production strings,
// and writes the final qa-report-{timestamp}.{md,json} pair.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { BASE_URL, ACTORS, FORBIDDEN_PROD_STRINGS, QA_TAG } = require('../utils/qaConfig');
const qaApi = require('../utils/qaApi');
const { snap, listForRun } = require('../utils/qaScreenshots');
const { log, attach, writeReport, load } = require('../utils/qaReport');

const ACTOR = ACTORS.auditor.handle;

function ageDays(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return null;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  return Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - d) / 86400000);
}

test('Auditor · supervisor checks', async ({ page }) => {
  // 1. Site loads at all
  let siteResp;
  try {
    siteResp = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    if (!siteResp || siteResp.status() >= 400) {
      log.p0(ACTOR, 'site-load', `status=${siteResp && siteResp.status()}`);
    } else {
      log.pass(ACTOR, 'site-load', `status=${siteResp.status()}`);
    }
  } catch (e) {
    log.p0(ACTOR, 'site-load', `unreachable: ${e && e.message}`);
  }
  await snap(page, 'auditor', 'site-loaded');

  // 2. /api/version (best-effort — endpoint may not exist on all envs)
  const ver = await qaApi.get('/version');
  if (ver.ok && ver.json) {
    log.pass(ACTOR, 'api-version', JSON.stringify(ver.json).slice(0, 200));
    attach('auditor', 'version', ver.json);
  } else {
    log.info(ACTOR, 'api-version', `not exposed (status=${ver.status})`);
  }

  // 3. Public marketplace endpoints
  const trips = await qaApi.get('/market/trips', { query: { status: 'active', limit: 200 } });
  const cargos = await qaApi.get('/market/cargos', { query: { status: 'active', limit: 200 } });
  const drivers = await qaApi.get('/market/drivers', { query: { limit: 200 } });

  if (!trips.ok) log.p0(ACTOR, 'api-trips', `status=${trips.status}`);
  else log.pass(ACTOR, 'api-trips', `${(trips.json && trips.json.trips || []).length} active`);
  if (!cargos.ok) log.p0(ACTOR, 'api-cargos', `status=${cargos.status}`);
  else log.pass(ACTOR, 'api-cargos', `${(cargos.json && cargos.json.cargos || []).length} active`);
  if (!drivers.ok) log.p1(ACTOR, 'api-drivers', `status=${drivers.status}`);
  else log.pass(ACTOR, 'api-drivers', `${(drivers.json && drivers.json.drivers || []).length} approved`);

  attach('auditor', 'api', {
    trips_total: (trips.json && trips.json.total) || 0,
    cargos_total: (cargos.json && cargos.json.total) || 0,
    drivers_total: (drivers.json && drivers.json.total) || 0,
  });

  // 4. Forbidden-strings audit on all public payloads. We deliberately allow
  // QA_TAG to slip through — Serik/Boris records SHOULD be visible in the
  // feed for the duration of the run; cleanup removes them after.
  const blob = JSON.stringify({ trips: trips.json, cargos: cargos.json, drivers: drivers.json });
  const hits = FORBIDDEN_PROD_STRINGS.filter((s) => blob.includes(s));
  if (hits.length) {
    log.p0(ACTOR, 'forbidden-strings-in-public-feed', hits.join(', '));
  } else {
    log.pass(ACTOR, 'forbidden-strings-in-public-feed', 'none');
  }

  // 5. Stale-data rules. Anything not tagged with [ar- and older than the
  // limits below is a real-prod hygiene problem — surface as P1.
  const today = new Date();
  const stalePickup = ((cargos.json && cargos.json.cargos) || [])
    .filter((c) => !/\[ar-/.test(`${c.cargo_desc || ''}${c.from_city || ''}`))
    .filter((c) => {
      const a = ageDays(c.pickup_date);
      return a !== null && a > 1; // >24h past
    });
  if (stalePickup.length) {
    log.p1(ACTOR, 'stale-pickup-cargos', `${stalePickup.length} active cargos with pickup_date >24h ago`);
  } else {
    log.pass(ACTOR, 'stale-pickup-cargos');
  }

  const staleArrival = ((trips.json && trips.json.trips) || [])
    .filter((t) => !/\[ar-/.test(`${t.driver_name || ''}${t.from_city || ''}`))
    .filter((t) => {
      const a = ageDays(t.arrival);
      return a !== null && a > 1;
    });
  if (staleArrival.length) {
    log.p1(ACTOR, 'stale-arrival-trips', `${staleArrival.length} active trips past arrival+24h`);
  } else {
    log.pass(ACTOR, 'stale-arrival-trips');
  }

  // 6. Cross-check what Serik/Boris recorded so report reflects whether the
  // earlier specs actually ran (vs were skipped because state is stale).
  const state = load();
  const seenActors = new Set(state.entries.map((e) => e.actor));
  if (!seenActors.has(ACTORS.serik.handle))   log.p1(ACTOR, 'serik-did-not-run', 'no Serik entries in state');
  if (!seenActors.has(ACTORS.boris.handle))   log.p1(ACTOR, 'boris-did-not-run', 'no Boris entries in state');

  // 7. Attach screenshots from all actors (already saved by their specs)
  attach('auditor', 'screenshots', listForRun());

  // 8. Write report
  const { mdPath, jsonPath, state: finalState } = writeReport();
  console.log(`\n[QA REPORT] ${mdPath}`);
  console.log(`[QA REPORT] ${jsonPath}`);
  console.log(`[QA SUMMARY] P0=${finalState.counts.P0} P1=${finalState.counts.P1} P2=${finalState.counts.P2} pass=${finalState.counts.pass}`);
  console.log(`[QA NEXT  ] ${finalState.nextFix}`);

  expect(finalState.counts.P0, `QA report contains P0 issues: ${finalState.nextFix}`).toBe(0);
  expect(finalState.counts.P1, `QA report contains P1 issues: ${finalState.nextFix}`).toBe(0);
});
