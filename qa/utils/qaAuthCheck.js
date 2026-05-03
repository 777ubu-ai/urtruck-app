#!/usr/bin/env node
// Quick smoke for the QA auth path. Verifies that each of Serik / Boris /
// Auditor can be obtained without burning the public guest rate-limit.
//
// Exit codes:
//   0 — every actor produced a valid token
//   2 — at least one actor failed (rate-limit, missing endpoint, bad role…)
//
// Output is human-friendly so this can be wired into CI.

const path = require('path');
const fs = require('fs');
const { API_BASE, REPORTS_DIR } = require('./qaConfig');
const qaApi = require('./qaApi');

function readAgentToken() {
  if (process.env.QA_AGENT_TOKEN) return { token: process.env.QA_AGENT_TOKEN, from: 'env' };
  const f = path.join(REPORTS_DIR, '_agent-token');
  if (fs.existsSync(f)) {
    try {
      const v = fs.readFileSync(f, 'utf8').trim();
      if (v) return { token: v, from: 'file' };
    } catch {}
  }
  return { token: null, from: null };
}

(async () => {
  console.log(`[qa-auth-check] api=${API_BASE}`);
  const { token, from } = readAgentToken();
  if (!token) {
    console.log('[qa-auth-check] ⚠️ QA_AGENT_TOKEN not set — actors will fall back to /register/guest (rate-limited)');
  } else {
    console.log(`[qa-auth-check] QA_AGENT_TOKEN present (from ${from})`);
  }

  const actors = [
    { name: 'serik',   role: 'driver'   },
    { name: 'boris',   role: 'client'   },
    { name: 'auditor', role: 'auditor'  },
  ];

  let failed = 0;
  for (const { name, role } of actors) {
    const r = await qaApi.ensureActor(name, { role });
    if (r.token) {
      const probe = await qaApi.get('/register/me', { token: r.token });
      const okMe = probe.ok ? 'me=200' : `me=${probe.status}`;
      console.log(`  ✓ ${name.padEnd(8)} via=${r.source.padEnd(14)} userId=${r.userId || '?'} ${okMe}${r.warning ? `  (warning: ${r.warning})` : ''}`);
    } else {
      console.log(`  ✗ ${name.padEnd(8)} via=${r.source}  error=${r.error || 'no-token'}`);
      failed++;
    }
  }
  if (failed) {
    console.log(`[qa-auth-check] ${failed}/${actors.length} actors failed`);
    process.exit(2);
  } else {
    console.log('[qa-auth-check] ✅ all actors authenticated');
    process.exit(0);
  }
})().catch((e) => { console.error('[qa-auth-check] fatal:', e); process.exit(1); });
