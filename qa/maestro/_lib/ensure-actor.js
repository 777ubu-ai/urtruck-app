// ensure-actor.js — Maestro JS runScript bridge to POST /qa/ensure-actor.
//
// Same contract as _lib/ensure-actor.sh (shell variant used by CI/manual),
// but produces the token through Maestro's `output` channel so YAML flows
// can paste it via `${output.token}`. Keep both in sync.
//
// Required env (Maestro forwards anything prefixed with MAESTRO_):
//   MAESTRO_QA_AGENT_TOKEN — secret shared with backend ($QA_AGENT_TOKEN)
//   MAESTRO_ACTOR          — serik | boris | fedya | armando | berik | auditor
//
// Optional env:
//   MAESTRO_BACKEND_BASE   — defaults to http://127.0.0.1:8001/api/v1
//   MAESTRO_ALLOW_REMOTE   — set to '1' to allow non-loopback backends
//
// Output:
//   output.token — bearer token for the QA actor session
//   output.role  — actor role hint (serik=driver, boris=client, auditor=auditor)
//
// Failure:
//   throws — flow stops; Maestro shows the message in the report.

var actor = MAESTRO_ACTOR;
if (!actor) throw 'ensure-actor: MAESTRO_ACTOR env var is required (serik|boris|fedya|armando|berik|auditor)';
if (actor !== 'serik' && actor !== 'boris' && actor !== 'fedya' && actor !== 'armando' && actor !== 'berik' && actor !== 'auditor') {
  throw 'ensure-actor: unknown actor ' + actor;
}

var qaToken = MAESTRO_QA_AGENT_TOKEN;
if (!qaToken) throw 'ensure-actor: MAESTRO_QA_AGENT_TOKEN env var is required (do NOT hardcode it)';

var base = MAESTRO_BACKEND_BASE || 'http://127.0.0.1:8001/api/v1';

if (MAESTRO_ALLOW_REMOTE !== '1') {
  if (base.indexOf('urtruck.kz') !== -1 ||
      base.indexOf('185.22.65.11') !== -1 ||
      base.indexOf('://prod') !== -1) {
    throw 'ensure-actor: refusing to run against production backend (' + base + '). Set MAESTRO_ALLOW_REMOTE=1 to override.';
  }
}

var res = http.post(base + '/qa/ensure-actor', {
  headers: {
    'X-QA-Agent-Token': qaToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ actor: actor })
});

if (!res || res.status !== 200) {
  throw 'ensure-actor: backend returned HTTP ' + (res ? res.status : 'no-response');
}

var data = json(res.body);
if (!data || !data.token) {
  throw 'ensure-actor: response body has no .token';
}

output.token = data.token;
output.role = data.role || ((actor === 'serik' || actor === 'armando' || actor === 'berik') ? 'driver' : (actor === 'boris' || actor === 'fedya') ? 'client' : 'auditor');
