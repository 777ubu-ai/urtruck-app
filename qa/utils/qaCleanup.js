#!/usr/bin/env node
// QA cleanup driver.
//
// Strategy (in order of preference):
//   1. Hit POST /api/v1/qa/cleanup if QA_CLEANUP_TOKEN is set (or read from
//      ./reports/_cleanup-token). Server-side soft-cancel is the only
//      reliable path because it does not require each owner's bearer token.
//   2. Fall back to public DELETE/PATCH calls using cached agent tokens
//      when the admin endpoint is missing (e.g. backend not yet deployed).
//
// Always lists matches first; --dry-run never mutates. By default, scope
// is "this run" — pass --all to target every [ar-...] record server-wide.

const fs = require('fs');
const path = require('path');
const { API_BASE, QA_TAG, QA_RUN_ID, REPORTS_DIR } = require('./qaConfig');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const ALL = argv.includes('--all');
const CONFIRM = argv.includes('--confirm') || !ALL; // single-run cleanup auto-confirms; --all needs explicit --confirm

// TLS for self-signed / not-fully-trusted production certs (same as qaApi.js).
let _dispatcher;
function getDispatcher() {
  if (_dispatcher !== undefined) return _dispatcher;
  try {
    const { Agent } = require('undici');
    _dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  } catch {
    _dispatcher = null;
  }
  return _dispatcher;
}

async function jsonFetch(url, opts = {}) {
  const disp = getDispatcher();
  const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
  const init = { method: opts.method || 'GET', headers, body: opts.body };
  if (disp) init.dispatcher = disp;
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { ok: false, status: 0, error: (e && e.message) || String(e) };
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

function readToken() {
  if (process.env.QA_CLEANUP_TOKEN) return process.env.QA_CLEANUP_TOKEN;
  const f = path.join(REPORTS_DIR, '_cleanup-token');
  if (fs.existsSync(f)) {
    try { return fs.readFileSync(f, 'utf8').trim() || null; } catch {}
  }
  return null;
}

async function tryAdminCleanup() {
  const token = readToken();
  if (!token) {
    console.log('[qa-cleanup] no QA_CLEANUP_TOKEN — skipping admin endpoint');
    return null;
  }
  const ping = await jsonFetch(`${API_BASE}/qa/cleanup/info`, {
    headers: { 'X-QA-Cleanup-Token': token },
  });
  if (!ping.ok) {
    console.log(`[qa-cleanup] admin endpoint not available (${ping.status} ${ping.text || ping.error || ''})`);
    return null;
  }
  console.log(`[qa-cleanup] admin endpoint OK; tag_prefix=${ping.json && ping.json.tag_prefix}`);

  const body = JSON.stringify({
    run_id: ALL ? null : QA_RUN_ID,
    all: !!ALL,
    dry_run: !!DRY,
    confirm: !DRY && (ALL ? CONFIRM : true),
  });
  const r = await jsonFetch(`${API_BASE}/qa/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-QA-Cleanup-Token': token },
    body,
  });
  if (!r.ok) {
    console.log(`[qa-cleanup] admin call failed: ${r.status} ${r.text || ''}`);
    return null;
  }
  return r.json;
}

// ─── Fallback: public DELETE/PATCH using cached agent tokens ─────────────
async function loadCachedTokens() {
  const tokenFile = path.join(REPORTS_DIR, `_tokens-${QA_RUN_ID}.json`);
  if (!fs.existsSync(tokenFile)) return {};
  try { return JSON.parse(fs.readFileSync(tokenFile, 'utf8')); }
  catch { return {}; }
}

function looksLikeQa(row) {
  const blob = [row.cargo_desc, row.from_city, row.to_city, row.transit, row.driver_name, row.cargo_type, row.message]
    .filter(Boolean).join(' ');
  return /\[ar-/.test(blob);
}

async function publicFallbackCleanup() {
  const tokens = await loadCachedTokens();
  const trips = await jsonFetch(`${API_BASE}/market/trips?show_demo=true&status=active&limit=300`);
  const cargos = await jsonFetch(`${API_BASE}/market/cargos?show_demo=true&status=active&limit=300`);
  const tripsList = ((trips.json && trips.json.trips) || []).filter(looksLikeQa);
  const cargosList = ((cargos.json && cargos.json.cargos) || []).filter(looksLikeQa);

  console.log(`[fallback] trips matching: ${tripsList.length}; cargos matching: ${cargosList.length}`);

  if (DRY) return { trips_found: tripsList.length, cargos_found: cargosList.length, applied: false, dry_run: true };

  let cancelled_trips = 0, cancelled_cargos = 0, skipped = 0;
  for (const c of cargosList) {
    const tk = tokens[c.owner_id];
    if (!tk) { skipped++; continue; }
    const r = await jsonFetch(`${API_BASE}/market/cargos/${c.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tk}` } });
    if (r.ok) cancelled_cargos++;
  }
  for (const t of tripsList) {
    // No public DELETE for trips — best-effort PATCH that re-saves price as
    // a no-op cannot cancel; report and let admin SQL do the rest.
    skipped++;
  }
  return { cancelled_trips, cancelled_cargos, skipped_no_token: skipped, applied: cancelled_trips + cancelled_cargos > 0 };
}

// ─── Verification: re-list public feed and grep for [ar-...] ─────────────
async function verify() {
  const trips = await jsonFetch(`${API_BASE}/market/trips?status=active&limit=300`);
  const cargos = await jsonFetch(`${API_BASE}/market/cargos?status=active&limit=300`);
  const t = ((trips.json && trips.json.trips) || []).filter(looksLikeQa);
  const c = ((cargos.json && cargos.json.cargos) || []).filter(looksLikeQa);
  return {
    total_active_trips: (trips.json && trips.json.total) || (trips.json && trips.json.trips || []).length,
    total_active_cargos: (cargos.json && cargos.json.total) || (cargos.json && cargos.json.cargos || []).length,
    qa_trips_visible: t.length,
    qa_cargos_visible: c.length,
  };
}

async function main() {
  console.log(`[qa-cleanup] api=${API_BASE}  scope=${ALL ? 'ALL [ar-...]' : QA_RUN_ID}  mode=${DRY ? 'dry-run' : 'apply'}`);

  const before = await verify();
  console.log(`[qa-cleanup] BEFORE — qa_trips_visible=${before.qa_trips_visible} qa_cargos_visible=${before.qa_cargos_visible}`);

  let result = await tryAdminCleanup();
  if (!result) {
    console.log('[qa-cleanup] falling back to public PATCH/DELETE with cached tokens');
    result = await publicFallbackCleanup();
  }
  console.log('[qa-cleanup] result:', JSON.stringify(result, null, 2));

  if (!DRY) {
    // Some servers need a tick to flush WAL — re-verify after a short pause.
    await new Promise((r) => setTimeout(r, 500));
  }
  const after = await verify();
  console.log(`[qa-cleanup] AFTER  — qa_trips_visible=${after.qa_trips_visible} qa_cargos_visible=${after.qa_cargos_visible}`);

  if (after.qa_trips_visible === 0 && after.qa_cargos_visible === 0) {
    console.log('[qa-cleanup] ✅ public feed is QA-clean');
    process.exit(0);
  } else {
    console.log('[qa-cleanup] ⚠️ residual QA records remain — re-run with --all --confirm or apply backend script');
    process.exit(DRY ? 0 : 2);
  }
}

main().catch((e) => { console.error('[qa-cleanup] fatal:', e); process.exit(1); });
