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

test('deployment script is scoped to QA2 feed components with reversible configuration', () => {
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
  assert.match(script, /systemctl show urtruck-qa2\.service -p EnvironmentFiles/);
  assert.match(script, /test ! -L "\$qa_env"/);
  assert.match(script, /qa2-env-was-changed/);
});

test('QA2 deploy includes the new count service and rolls back its first install', () => {
  const service = 'backend/services/external_freight_count_snapshots.py';
  const files = script.match(/^paths=\(([\s\S]*?)^\)/m)?.[1] || '';
  const installed = script.match(/^code_paths=\(([^)]*)\)/m)?.[1] || '';
  assert.ok(files.includes(service));
  assert.ok(installed.includes(service));
  assert.match(script, /external_freight_count_snapshots\.py\) touch "\$backup\/count-module-was-absent"/);
  assert.match(script, /test -f "\$backup\/count-module-was-absent"; then\s+rm -f -- "\$qa\/backend\/services\/external_freight_count_snapshots\.py"/);
});

test('QA2 deployment waits for API readiness before starting either bridge', () => {
  const stopTimers = script.indexOf('sudo -n systemctl stop "${bridge_timers[@]}"');
  const waitForRunningBridges = script.indexOf('for unit in "${bridge_units[@]}"; do wait_for_oneshot_idle "$unit"; done');
  const firstCopy = script.indexOf('install -D -m 0644 "$stage/$path" "$qa/$path"');
  const restartApi = script.indexOf('sudo -n systemctl restart urtruck-qa2.service', firstCopy);
  const apiReady = script.indexOf('wait_for_qa2_api\nPYTHONPATH=', restartApi);
  const snapshotRuntime = script.indexOf('QA2_COUNT_SNAPSHOT_RUNTIME=enabled,fresh', apiReady);
  const startBridge = script.indexOf('sudo -n systemctl start urtruck-qa2-feed-bridge.service', snapshotRuntime);
  const incomingStart = script.indexOf('sudo -n systemctl start urtruck-qa2-feed-bridge.service', startBridge);
  const ownedStart = script.indexOf('sudo -n systemctl start urtruck-qa2-owned-feed-bridge.service', incomingStart);
  const restoreTimers = script.indexOf('for unit in "${bridge_timers[@]}"; do', ownedStart);

  for (const index of [stopTimers, waitForRunningBridges, firstCopy, restartApi, apiReady,
    snapshotRuntime, startBridge, incomingStart, ownedStart, restoreTimers]) assert.notEqual(index, -1);
  assert.ok(stopTimers < waitForRunningBridges && waitForRunningBridges < firstCopy);
  assert.ok(firstCopy < restartApi && restartApi < apiReady && apiReady < incomingStart);
  assert.ok(snapshotRuntime < startBridge);
  assert.ok(incomingStart < ownedStart && ownedStart < restoreTimers);
  assert.match(script, /\/openapi\.json/);
  assert.match(script, /\/api\/v1\/external-freight\/import/);
  assert.match(script, /qa2_bridge_did_not_quiesce/);
  assert.doesNotMatch(script, /systemctl restart\s+"\$\{(?:units|bridge_units)\[@\]\}"/);
});

test('QA2 snapshots are refreshed and verified before the feature flag is enabled', () => {
  const warmup = script.indexOf('QA2_COUNT_SNAPSHOT_WARMUP=');
  const envChanged = script.indexOf('touch "$backup/qa2-env-was-changed"');
  const enable = script.indexOf('EXTERNAL_FREIGHT_COUNT_SNAPSHOTS_ENABLED=true');
  const restart = script.indexOf('sudo -n systemctl restart urtruck-qa2.service', envChanged);
  assert.ok(warmup >= 0 && envChanged > warmup && enable > envChanged && restart > enable);
  assert.match(script, /qa2_external_freight_database_precondition_failed/);
  assert.match(script, /qa2_carrier_database_precondition_failed/);
  assert.match(script, /qa2_count_snapshot_warmup_mismatch/);
  assert.match(script, /qa2_count_snapshot_not_fresh/);
});

test('rollback restores code and readiness before resuming timers without firing a bridge one-shot', () => {
  const start = script.indexOf('rollback() {');
  const end = script.indexOf("trap 'code=$?", start);
  assert.ok(start >= 0 && end > start);
  const rollback = script.slice(start, end);
  assert.match(rollback, /systemctl restart urtruck-qa2\.service/);
  assert.match(rollback, /wait_for_qa2_api/);
  assert.match(rollback, /rollback_api_not_ready; QA2 timers remain stopped/);
  assert.match(rollback, /qa2-env-was-changed/);
  assert.match(rollback, /qa2-env"/);
  assert.doesNotMatch(rollback, /systemctl (?:start|restart) urtruck-qa2-(?:owned-)?feed-bridge\.service/);
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

test('QA2 health is installed, hashed and scheduled without shared collector mutation', () => {
  const service = readFileSync('ops/telegram-feed/urtruck-qa2-feed-health.service', 'utf8');
  const timer = readFileSync('ops/telegram-feed/urtruck-qa2-feed-health.timer', 'utf8');
  for (const file of ['external_freight_parser.py', 'external_freight_dal.py',
    'backend/api/external_freight.py', 'ops/telegram-feed/health.py',
    'urtruck-qa2-feed-health.service', 'urtruck-qa2-feed-health.timer']) assert.ok(script.includes(file), file);
  assert.match(service, /--qa2-only/);
  assert.match(service, /--state-dir \/home\/ubuntu\/urtruck-qa2\/external-feed-health\/state/);
  assert.doesNotMatch(service, /--recover/);
  assert.match(timer, /OnUnitActiveSec=60s/);
  assert.match(script, /enable --now urtruck-qa2-feed-health\.timer/);
  assert.match(script, /health-timer-was-active/);
  assert.match(script, /\$\{code_paths\[@\]\}/);
});
