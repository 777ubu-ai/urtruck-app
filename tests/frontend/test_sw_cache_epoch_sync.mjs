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
//
// 2026-08-19 review (owner, independent release review on this same PR):
// the original version of test 3 here claimed to check "the actual
// generated index.html" but never ran postprocess_web_release.py or
// inspected a real index.html — it just re-ran the same regex against
// sw-template.js a second time, proving nothing beyond test 2. Rewritten
// to actually invoke the script against a fixture dist/ and read its
// real output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
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

test('running the real script against a fixture dist/ writes the epoch actually read from sw-template.js, not a stale one', () => {
  // Real integration test: copy the real postprocess script + the real
  // sw-template.js into a scratch dist/, run the script exactly as CI
  // does (`python3 scripts/postprocess_web_release.py` from repo root
  // with a real dist/index.html present), and inspect the real output —
  // no re-implementation of the extraction logic here.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-sw-epoch-test-'));
  const distDir = path.join(scratch, 'dist');
  fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html><head></head><body></body></html>');
  fs.copyFileSync(path.join(REPO_ROOT, 'sw-template.js'), path.join(scratch, 'sw-template.js'));
  fs.copyFileSync(
    path.join(REPO_ROOT, 'scripts', 'postprocess_web_release.py'),
    path.join(scratch, 'postprocess_web_release.py'),
  );

  execFileSync('python3', ['postprocess_web_release.py'], { cwd: scratch });

  const generated = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const expectedVersion = swTemplate.match(/const CACHE = 'urtruck-(v\d+)-market'/)[1]; // e.g. "v18"

  assert.match(generated, new RegExp(`const V="${expectedVersion}-market"`), 'the epoch actually written into a real generated index.html must match sw-template.js right now');
  assert.match(generated, new RegExp(`sw\\.js\\?v=${expectedVersion.slice(1)}`));
  assert.doesNotMatch(generated, /const V="v16-market"/, 'the fixture proof must not silently pass because both sides still say v16');
});
