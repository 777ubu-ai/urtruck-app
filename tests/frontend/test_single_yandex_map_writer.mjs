// test_single_yandex_map_writer — regression-guard for the real-road-routing
// bug (2026-08-19, owner report + screenshot): the map drew a straight
// fallback line ("Алматы → Москва" crossing Uzbekistan/Turkmenistan on a
// dashed line) instead of a real road route.
//
// Root cause: `.github/workflows/yandex-map-finalizer.yml` — a leftover CI
// workflow from 2026-08-16 — ran on every deploy (workflow_run, AFTER
// `UrTruck Secure Production Deploy` completed) and SSH-patched the already
// deployed `index.html` to inject a SECOND Yandex Maps script: JS API v3.
// Commit 410811b ("fix(map): switch web tracking to supported Yandex JS API
// 2.1", 2026-08-17) explicitly moved the app to v2.1 — "the version accepted
// by the production key" for real routing — and updated both deploy
// workflows accordingly, but never removed the old v3-injecting finalizer.
// Production ended up serving BOTH scripts; nothing in `src/` uses v3
// (`ymaps3`) at all — TruckMap.web.js only ever reads `globalThis.ymaps`
// (v2.1). Deleting the finalizer restores a single writer for index.html,
// matching the "one writer" principle already documented in deploy.yml's
// header comment (added after an earlier, similar two-writer race).
//
// This guard can only check what a local test can see (workflow files +
// app code) — it cannot see production HTML — so it asserts the two things
// that made this bug possible: no workflow injects a v3 script, and no
// workflow SSH-patches index.html a second time after the real deploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowsDir = '.github/workflows';
const workflowFiles = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
const webMapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');

test('no workflow injects Yandex Maps JS API v3 (app code only supports v2.1)', () => {
  for (const file of workflowFiles) {
    const content = fs.readFileSync(`${workflowsDir}/${file}`, 'utf8');
    assert.doesNotMatch(
      content,
      /api-maps\.yandex\.ru\/v3\//,
      `${file} injects Yandex Maps v3 — app code (TruckMap.web.js) only reads globalThis.ymaps (v2.1); a second, unsupported script broke real road routing on 2026-08-19`,
    );
  }
});

test('index.html is written by exactly one production deploy workflow', () => {
  // Secure Production Deploy is the single legitimate writer (bakes in
  // Yandex v2.1 via scripts/injectYandexMaps.mjs at build time, then SCPs
  // dist/* once). No other workflow should SSH back in and patch the
  // already-deployed index.html afterwards.
  const patchers = workflowFiles.filter((file) => {
    if (file === 'secure-production-deploy.yml') return false;
    const content = fs.readFileSync(`${workflowsDir}/${file}`, 'utf8');
    return /REMOTE_DIR.*index\.html|index\.html.*REMOTE_DIR|Inject.*index/i.test(content);
  });
  assert.deepEqual(patchers, [], `these workflows patch index.html after deploy, re-creating the two-writer race: ${patchers.join(', ')}`);
});

test('TruckMap.web.js only depends on Yandex JS API v2.1 (globalThis.ymaps)', () => {
  assert.match(webMapSrc, /globalThis\.ymaps/);
  assert.doesNotMatch(webMapSrc, /ymaps3|api-maps\.yandex\.ru\/v3/);
});
