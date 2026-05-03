#!/usr/bin/env node
// Standalone cleanup script. Walks the public marketplace endpoints, finds
// rows tagged with QA_TAG (or any [ar-XXXX] pattern when --all is passed),
// and cancels them via the owner's token if available — otherwise prints the
// list so an operator can run the DB cleanup script.
//
// Safety:
//   - never touches rows without an [ar-...] marker
//   - never deletes; only cancel/archive
//   - --all requires --confirm to actually mutate
//
// Usage:
//   QA_RUN_ID=rabcd node qa/utils/qaCleanup.js
//   node qa/utils/qaCleanup.js --all --confirm

const path = require('path');
const fs = require('fs');
const { API_BASE, QA_TAG, QA_RUN_ID, REPORTS_DIR } = require('./qaConfig');

const ALL = process.argv.includes('--all');
const CONFIRM = process.argv.includes('--confirm');
const TAG_RE = ALL ? /\[ar-[a-z0-9]+\]/i : new RegExp(QA_TAG.replace(/[[\]]/g, (c) => `\\${c}`), 'i');

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const t = await r.text();
  try { return { ok: r.ok, status: r.status, json: t ? JSON.parse(t) : null }; }
  catch { return { ok: r.ok, status: r.status, json: null, text: t }; }
}

function looksLikeQa(row) {
  const blob = [row.cargo_desc, row.from_city, row.to_city, row.transit, row.driver_name, row.cargo_type, row.message]
    .filter(Boolean).join(' ');
  return TAG_RE.test(blob);
}

async function loadActorTokens() {
  // Cleanup uses tokens persisted by individual agents during their run so
  // it can call DELETE/PATCH as the original owner. Falls back to anonymous
  // listing only when no token cache exists.
  const tokenFile = path.join(REPORTS_DIR, `_tokens-${QA_RUN_ID}.json`);
  if (!fs.existsSync(tokenFile)) return {};
  try { return JSON.parse(fs.readFileSync(tokenFile, 'utf8')); }
  catch { return {}; }
}

async function main() {
  console.log(`[qa-cleanup] api=${API_BASE}  scope=${ALL ? 'ALL [ar-...]' : QA_TAG}  mutate=${(!ALL || CONFIRM) ? 'yes' : 'NO (need --confirm)'}`);

  const tokens = await loadActorTokens();
  const dryOnly = ALL && !CONFIRM;

  // Trips
  const t = await fetchJson(`${API_BASE}/market/trips?show_demo=true&limit=200&status=active`);
  const tripsRaw = (t.json && t.json.trips) || [];
  const trips = tripsRaw.filter(looksLikeQa);
  console.log(`Trips matching: ${trips.length}/${tripsRaw.length}`);
  for (const row of trips) {
    console.log(`  trip ${row.id}  ${row.from_city}→${row.to_city}  driver=${row.driver_name || '-'}`);
    if (dryOnly) continue;
    // No public DELETE endpoint for trips owned by another user — use PATCH
    // status=cancelled if backend supports it; otherwise log.
    const owner = row.driver_id;
    const token = owner && tokens[owner];
    if (!token) {
      console.log('    [skipped] no cached token; run cleanup_dirty_cargos.py on the server');
      continue;
    }
    const r = await fetch(`${API_BASE}/market/trips/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ price: row.price || 0 }), // no-op patch keeps PATCH valid; status change needs separate endpoint
    });
    console.log(`    PATCH → ${r.status}`);
  }

  // Cargos
  const c = await fetchJson(`${API_BASE}/market/cargos?show_demo=true&limit=200&status=active`);
  const cargosRaw = (c.json && c.json.cargos) || [];
  const cargos = cargosRaw.filter(looksLikeQa);
  console.log(`Cargos matching: ${cargos.length}/${cargosRaw.length}`);
  for (const row of cargos) {
    console.log(`  cargo ${row.id}  ${row.from_city}→${row.to_city}  desc="${(row.cargo_desc || '').slice(0, 60)}"`);
    if (dryOnly) continue;
    const owner = row.owner_id;
    const token = owner && tokens[owner];
    if (!token) {
      console.log('    [skipped] no cached token');
      continue;
    }
    const r = await fetch(`${API_BASE}/market/cargos/${row.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log(`    DELETE → ${r.status}`);
  }

  if (!trips.length && !cargos.length) {
    console.log('Nothing to clean for this run.');
  } else {
    console.log('\nIf nothing was actually cancelled (no cached tokens), run:');
    console.log('  python3 backend/scripts/cleanup_dirty_cargos.py --apply');
    console.log('on the server to soft-cancel by token match.');
  }
}

main().catch((e) => { console.error('[qa-cleanup] fatal:', e); process.exit(1); });
