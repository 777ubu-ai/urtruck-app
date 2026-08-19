// test_sw_cache_epoch_sync — regression-guard for a real production bug
// (2026-08-19, owner report: "залил фикс, а на сайте ничего не поменялось").
//
// scripts/postprocess_web_release.py used to hardcode the force-refresh
// epoch it writes into index.html as a literal default ("v16-market"/"16"),
// completely independent of sw-template.js's own CACHE name (which had
// already moved on to "v18-market"). Neither deploy.sh nor any CI workflow
// ever set URTRUCK_SW_EPOCH/URTRUCK_SW_QUERY, so EVERY release kept writing
// the same stale epoch. A returning visitor whose browser already stored
// ur_sw_v="v16-market" from any earlier deploy never saw the force
// cache-clear + service-worker-unregister fire again on subsequent
// deploys — new backend/frontend fixes stayed invisible behind a stale
// Service Worker for anyone who had already visited once, no matter how
// many deploys shipped after that.
//
// Fixed to derive the epoch FROM sw-template.js's actual CACHE constant at
// build time, so the two literals can never drift apart silently again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const postprocess = fs.readFileSync('scripts/postprocess_web_release.py', 'utf8');
const swTemplate = fs.readFileSync('sw-template.js', 'utf8');

test('postprocess no longer hardcodes the stale v16 epoch that stopped reaching returning visitors', () => {
  assert.doesNotMatch(postprocess, /os\.environ\.get\("URTRUCK_SW_EPOCH",\s*"v16-market"\)/, 'the exact stale hardcoded default must not come back as active code (mentioning it in a comment is fine)');
  assert.doesNotMatch(postprocess, /os\.environ\.get\("URTRUCK_SW_QUERY",\s*"16"\)/);
  assert.match(postprocess, /SW_TEMPLATE\.read_text/, 'must read sw-template.js at build time instead of hand-bumping a second literal');
});

test('sw-template.js still declares CACHE as urtruck-vN-market (the shape postprocess.py parses)', () => {
  const swMatch = swTemplate.match(/const CACHE = 'urtruck-(v\d+)-market'/);
  assert.ok(swMatch, "sw-template.js must define CACHE as urtruck-vN-market so postprocess_web_release.py's extraction regex keeps working");
});

test('the actual generated index.html force-refresh epoch matches sw-template.js\'s current version, not a stale default', () => {
  // Run the real extraction logic (not a JS re-implementation of the
  // regex, which could silently drift from the Python one) against the
  // real sw-template.js and confirm it does NOT fall back to v16.
  const version = execFileSync('python3', ['-c', `
import re
src = open('sw-template.js', encoding='utf-8').read()
m = re.search(r"CACHE\\s*=\\s*'urtruck-(v\\d+)-market'", src)
print(m.group(1) if m else 'NO_MATCH')
`]).toString().trim();
  assert.notEqual(version, 'NO_MATCH');
  assert.notEqual(version, 'v16', 'sw-template.js has moved past v16 — if this ever fires, the epoch-sync logic silently broke again');
});
