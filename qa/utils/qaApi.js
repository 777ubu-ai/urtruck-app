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

module.exports = { call, get, post, patch, del, ensureGuest, QA_RUN_ID, QA_TAG };
