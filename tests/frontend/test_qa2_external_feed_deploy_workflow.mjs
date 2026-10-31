import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-qa2-external-feed.yml', 'utf8');
const script = readFileSync('scripts/qa/deploy_external_feed_candidate.sh', 'utf8');

test('external-feed QA2 deploy requires promoted exact SHA and full quality gate', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /INSTALL_URTRUCK_FEED_QA2/);
  assert.match(workflow, /test "\$QA_SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/quality-gate-reusable\.yml/);
  assert.match(workflow, /needs: \[feed-preflight, required-quality-gate\]/);
  assert.match(workflow, /environment:\s*\n\s+name: qa2/);
});

test('deployment script is scoped to feed components, online backups, and code-only rollback', () => {
  for (const marker of [
    'external_freight_classifier.py', 'external_freight_import_adapter.py',
    'external_freight_queue_bridge.py', 'external-feed-owned/adapter.sqlite3',
    'src.backup(dst)', 'PRAGMA quick_check', 'EXTERNAL_FREIGHT_DEPLOYMENT_TARGET',
    'external-feed-component-manifest', 'flock -n 9', 'GITHUB_RUN_ATTEMPT',
  ]) assert.ok(script.includes(marker), `missing deploy invariant: ${marker}`);
  assert.match(script, /urtruck-qa2-feed-bridge\.service/);
  assert.match(script, /urtruck-qa2-owned-feed-bridge\.service/);
  assert.doesNotMatch(script, /urtruck-telegram-feed\.service|collector\/(?:feed|health)\.py/);
  assert.doesNotMatch(script, /systemctl restart[^\n]*(?:production|telegram-feed)/i);
  assert.match(script, /# Code backup and consistent online snapshots; database snapshots are never restored over newer live state\./);
});

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Исполняем настоящий Python preflight из установщика без SSH и доступа к серверу.
const marker = 'python3 - "$qa/external-feed-bridge.env" "$qa/external-feed-owned.env" <<\'PY\'\n';
const start = script.indexOf(marker);
assert.ok(start >= 0, 'environment preflight must exist');
const preflight = script.slice(start + marker.length).split('\nPY\n')[0];

function checkEnvironment(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-feed-preflight-'));
  try {
    const files = ['incoming', 'owned'].map((mode) => {
      const stateDir = mode === 'incoming' ? 'external-feed' : 'external-feed-owned';
      const values = {
        EXTERNAL_FREIGHT_API_URL: 'https://qa2.urtruck.kz',
        EXTERNAL_FREIGHT_DEPLOYMENT_TARGET: 'qa2',
        EXTERNAL_FREIGHT_ADAPTER_DB: '/home/ubuntu/urtruck-qa2/' + stateDir + '/adapter.sqlite3',
        EXTERNAL_FREIGHT_SOURCE_DB: '/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3',
        EXTERNAL_FREIGHT_SOURCE_MODE: mode,
        EXTERNAL_FREIGHT_IMPORT_ENABLED: 'true',
        ...overrides[mode],
      };
      const file = join(dir, mode + '.env');
      writeFileSync(file, Object.entries(values).filter(([, value]) => value !== null)
        .map(([key, value]) => key + '=' + value).join('\n'));
      return file;
    });
    return spawnSync('python3', ['-', ...files], { input: preflight, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('QA2 preflight accepts explicitly enabled incoming and owned modes', () => {
  const result = checkEnvironment();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('QA2 preflight rejects missing source mode for either bridge', () => {
  for (const mode of ['incoming', 'owned']) {
    const result = checkEnvironment({ [mode]: { EXTERNAL_FREIGHT_SOURCE_MODE: null } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected_source_mode/);
  }
});

test('QA2 preflight rejects published mode and exchanged bridge modes', () => {
  for (const [mode, wrong] of [['incoming', 'published'], ['incoming', 'owned'], ['owned', 'incoming']]) {
    const result = checkEnvironment({ [mode]: { EXTERNAL_FREIGHT_SOURCE_MODE: wrong } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected_source_mode/);
  }
});

test('QA2 preflight rejects disabled or absent import flag for either bridge', () => {
  for (const mode of ['incoming', 'owned']) {
    for (const value of [null, '', 'false', '0']) {
      const result = checkEnvironment({ [mode]: { EXTERNAL_FREIGHT_IMPORT_ENABLED: value } });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /feed_import_not_enabled/);
    }
  }
});
