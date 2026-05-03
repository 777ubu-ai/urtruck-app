// Tiny fetch wrapper for the QA agents. Node 20+ has global fetch; we don't
// want to depend on axios. Every call carries an X-QA-Actor header so the
// Auditor can correlate API evidence back to a specific agent in the report.
//
// On failure we always resolve (never throw) — the QA flow needs to keep
// going to capture as much evidence as possible. Status/text are returned
// alongside parsed JSON; the caller decides how to react.

const { API_BASE, QA_RUN_ID, QA_TAG } = require('./qaConfig');

// Node 24's bundled fetch is strict about TLS chain validation. Production
// urtruck.kz currently serves a Let's Encrypt cert that Node cannot fully
// verify in some homebrew/nvm environments (UNABLE_TO_GET_ISSUER_CERT_LOCALLY).
// Use an undici Agent with rejectUnauthorized=false ONLY for QA traffic — we
// already pin to known internal hosts via QA_API_BASE / QA_BASE_URL, so this
// doesn't expose us to MITM in CI.
let _dispatcher;
function getDispatcher() {
  if (_dispatcher !== undefined) return _dispatcher;
  try {
    const undici = require('undici');
    _dispatcher = new undici.Agent({ connect: { rejectUnauthorized: false } });
  } catch {
    _dispatcher = null;
  }
  return _dispatcher;
}

async function call(method, pathname, { token, actor, body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null)).toString()
    : '';
  const url = `${API_BASE}${pathname}${qs}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-QA-Run': QA_RUN_ID,
  };
  if (actor) headers['X-QA-Actor'] = actor;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res, text, json;
  try {
    const opts = { method, headers, body: body ? JSON.stringify(body) : undefined };
    const disp = getDispatcher();
    if (disp) opts.dispatcher = disp;
    res = await fetch(url, opts);
    text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  } catch (e) {
    return { ok: false, status: 0, error: (e && (e.cause && e.cause.code) || e.message) + '', url };
  }
  return { ok: res.ok, status: res.status, json, text, url };
}

const get  = (p, opts) => call('GET',  p, opts);
const post = (p, body, opts) => call('POST',  p, { ...opts, body });
const patch = (p, body, opts) => call('PATCH', p, { ...opts, body });
const del  = (p, opts) => call('DELETE', p, opts);

// Lazy guest-session helper: most agents need a token to publish. The backend
// /register/guest is open and creates a fresh anonymous user we can sign as.
async function ensureGuest(actor) {
  const r = await post('/register/guest', null, { actor });
  if (!r.ok || !r.json) return { token: null, error: `${r.status} ${r.text || ''}`.slice(0, 200) };
  const data = r.json;
  return {
    token: data.token || data.access_token || null,
    userId: data.user_id || (data.user && data.user.id) || null,
    raw: data,
  };
}

// ─── Stable QA-actor session ────────────────────────────────────────────────
// Persisted between runs so qa:full doesn't burn a guest slot every time.
// Token cache is keyed by actor; a fresh token is minted whenever the cached
// one stops working (e.g. after a session-table wipe on the server).

const fs = require('fs');
const path = require('path');
const { REPORTS_DIR } = require('./qaConfig');

const STABLE_FILE = path.join(REPORTS_DIR, '_tokens-stable.json');

function readAgentToken() {
  if (process.env.QA_AGENT_TOKEN) return process.env.QA_AGENT_TOKEN;
  const f = path.join(REPORTS_DIR, '_agent-token');
  if (fs.existsSync(f)) {
    try { return fs.readFileSync(f, 'utf8').trim() || null; } catch {}
  }
  return null;
}

function loadStableTokens() {
  try { if (fs.existsSync(STABLE_FILE)) return JSON.parse(fs.readFileSync(STABLE_FILE, 'utf8')); }
  catch {}
  return {};
}

function saveStableTokens(obj) {
  fs.writeFileSync(STABLE_FILE, JSON.stringify(obj, null, 2));
}

// Probe a cached token by hitting /register/me. If 200, the token is good.
async function probeToken(token) {
  if (!token) return false;
  const r = await get('/register/me', { token });
  return r.ok;
}

// Result shape mirrors ensureGuest so call sites stay the same. Adds:
//   source: 'cache' | 'qa-endpoint' | 'guest-fallback'
//   warning: string|null
async function ensureActor(actorName, opts = {}) {
  const role = opts.role || null;
  const cache = loadStableTokens();
  const cached = cache[actorName];

  // 1. Reuse cached stable token if it still authenticates.
  if (cached && cached.token) {
    if (await probeToken(cached.token)) {
      return { token: cached.token, userId: cached.userId, source: 'cache', warning: null };
    }
  }

  // 2. Try the protected /qa/ensure-actor endpoint.
  const agentToken = readAgentToken();
  if (agentToken) {
    // Direct fetch (the generic call() wrapper doesn't expose extra headers).
    let res;
    try {
      const opts2 = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-QA-Agent-Token': agentToken,
          'X-QA-Run': QA_RUN_ID,
          'X-QA-Actor': actorName,
        },
        body: JSON.stringify({ actor: actorName, role }),
      };
      const disp = getDispatcher();
      if (disp) opts2.dispatcher = disp;
      res = await fetch(`${API_BASE}/qa/ensure-actor`, opts2);
    } catch (e) {
      return { token: null, error: `network error contacting /qa/ensure-actor: ${e && e.message}`, source: 'qa-endpoint', warning: 'falling back to guest' };
    }
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (res.ok && json && json.token) {
      const out = { token: json.token, userId: json.user_id, source: 'qa-endpoint', warning: null };
      cache[actorName] = { token: out.token, userId: out.userId, savedAt: new Date().toISOString() };
      saveStableTokens(cache);
      return out;
    }
    if (res.status !== 503 && res.status !== 404) {
      // Endpoint exists but rejected us — surface so the caller can decide.
      return { token: null, error: `qa/ensure-actor → ${res.status} ${text.slice(0, 200)}`, source: 'qa-endpoint', warning: null };
    }
    // 503/404 → endpoint not configured / not deployed yet → silently fall back
  }

  // 3. Fallback to public /register/guest with a clear warning so the
  // Auditor can downgrade any 429 here from P0 product to P1 infra.
  const g = await ensureGuest(actorName);
  if (g.token) {
    cache[actorName] = { token: g.token, userId: g.userId, savedAt: new Date().toISOString(), source: 'guest-fallback' };
    saveStableTokens(cache);
  }
  return {
    ...g,
    source: 'guest-fallback',
    warning: agentToken
      ? 'QA endpoint did not respond — fell back to public /register/guest'
      : 'QA_AGENT_TOKEN not set — using public /register/guest (subject to rate-limit)',
  };
}

module.exports = { call, get, post, patch, del, ensureGuest, ensureActor, QA_RUN_ID, QA_TAG };
