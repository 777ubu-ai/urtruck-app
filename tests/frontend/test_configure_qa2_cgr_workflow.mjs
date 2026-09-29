import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/configure-qa2-cgr.yml', 'utf8');

test('QA2 CGR workflow is manual, protected and isolated', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\n\s+name: qa2/);
  assert.match(workflow, /CONFIGURE_QA2_CGR/);
  assert.match(workflow, /test "\$GITHUB_REF_NAME" = "qa2\/integration-candidate"/);
  assert.match(workflow, /CGR_IIN_SALT:\s*\$\{\{ secrets\.CGR_IIN_SALT \}\}/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.doesNotMatch(workflow, /SERVER_PASS|sshpass|StrictHostKeyChecking=no|refs\/heads\/main/);
});

test('QA2 CGR workflow uses systemd, rollback and live gates', () => {
  for (const marker of [
    'CGR_FEATURE_ENABLED',
    'CGR_SCOREBOARD_INTERVAL_MIN',
    '.env.cgr-backup.',
    'systemctl restart urtruck-qa2.service',
    '/api/v1/borders/catalog',
    'nur_zholy_horgos dostyk_alashankou bakhty_pokitu',
    'QA2_CGR_LIVE_TIMESTAMP_MISSING',
    'Verify production fingerprint unchanged',
    'Roll back QA2 CGR settings on failure',
  ]) assert.ok(workflow.includes(marker), `missing ${marker}`);
  assert.match(workflow, /sudo -n ss -ltnpH 'sport = :8002'/);
  assert.match(workflow, /systemctl show -p ControlGroup/);
  assert.equal(workflow.includes('listener_pid" = "$main_pid'), false);
  assert.ok(workflow.includes('qa_env=/home/ubuntu/urtruck-qa2/.env'));
  assert.equal(workflow.includes('qa_env=/home/ubuntu/urtruck-qa2/backend/.env'), false);
  assert.doesNotMatch(workflow, /kill -TERM|kill -KILL|nohup/);
});
