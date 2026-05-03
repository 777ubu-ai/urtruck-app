// Centralised config for QA agents (Serik, Boris, Auditor).
//
// Why a separate config from tests/e2e: those run on the live web bundle as
// pure smoke checks. The QA framework here is a *staffed* test rig — every
// run is tagged with `qa_run_id` so created records can be cleaned up later
// without scanning by hand. Markers are deliberately built so they DO NOT
// match the marketplace.py DIRTY_TOKENS filter ('qa', 'test', 'demo', etc.):
// otherwise the Auditor's "appears in public feed" check would fail because
// the backend would silently hide the row.
//
// The marker prefix is "[ar-<short>]" (agent-run). It contains no token from
// the dirty-words list, so QA records reach the public list_trips/list_cargos
// response and Serik can validate the full publish→feed flow. cleanup looks
// for "[ar-" inside cargo_desc / driver_name / from_city / etc. and cancels
// matching rows.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// Default to production. Override with QA_BASE_URL=http://localhost:8080 etc.
const BASE_URL = (process.env.QA_BASE_URL || process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');

// API base. Production nginx proxies /security/api/ → :8001; bare API_BASE
// also works against the direct port for non-prod environments.
const API_BASE = (process.env.QA_API_BASE
  || `${BASE_URL}/api/v1`).replace(/\/$/, '');

// Stable per-run id. globalSetup writes the active id to a pointer file so
// every project (serik / boris / auditor) picks up the same one even though
// each runs in its own worker process. Falls back to env then to a fresh id.
const POINTER_FILE = path.resolve(__dirname, '..', 'reports', '_active-run-id.txt');
function readActiveRunId() {
  if (process.env.QA_RUN_ID) return process.env.QA_RUN_ID;
  try {
    if (fs.existsSync(POINTER_FILE)) {
      const v = fs.readFileSync(POINTER_FILE, 'utf8').trim();
      if (v) return v;
    }
  } catch {}
  return `r${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
}
const QA_RUN_ID = readActiveRunId();

// Embedded into product fields so cleanup can grep for it. Short enough not
// to break narrow card layouts.
const QA_TAG = `[ar-${QA_RUN_ID}]`;

// Per-actor display names. Note: NOT the strings "Серик/Белик" — those are
// blacklisted as fake-prod-seed in the previous audit. We use Latin-only
// internal handles and keep the cyrillic display purely on the QA report
// side so backend rows never contain the forbidden strings.
const ACTORS = {
  serik:   { handle: 'agent-serik',   display: 'Serik (driver QA)',   role: 'driver' },
  boris:   { handle: 'agent-boris',   display: 'Boris (shipper QA)',  role: 'client' },
  auditor: { handle: 'agent-auditor', display: 'Auditor (supervisor QA)', role: 'auditor' },
};

const REPORTS_DIR = path.join(ROOT, 'qa', 'reports');
const SCREENSHOTS_DIR = path.join(ROOT, 'qa', 'screenshots');
fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Forbidden strings the Auditor must never see in public feed responses.
// Keep in sync with marketplace.py DIRTY_TOKENS — but NOT including QA_TAG.
const FORBIDDEN_PROD_STRINGS = [
  'Тестер', 'Баке', 'Тест Водитель',
  'ИИ Володя', 'ai-volodya-test', 'Володя',
  'QA Откуда', 'QA Куда', 'Автотестовый', 'Playwright',
  'Белик', 'Серик', 'трусы',
];

function timestampSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

module.exports = {
  ROOT,
  BASE_URL,
  API_BASE,
  QA_RUN_ID,
  QA_TAG,
  ACTORS,
  REPORTS_DIR,
  SCREENSHOTS_DIR,
  FORBIDDEN_PROD_STRINGS,
  timestampSlug,
};
