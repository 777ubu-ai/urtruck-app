import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-server-readonly-audit.yml', 'utf8');

test('QA2 server audit is manual, exact-source and protected', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\n\s+branches: \[fix\/voice-stt-translation-20260925\]/);
  assert.match(workflow, /AUDIT_SOURCE_SHA/);
  assert.match(workflow, /GITHUB_REF_NAME" = "fix\/voice-stt-translation-20260925/);
  assert.match(workflow, /git rev-parse HEAD\)" = "\$AUDIT_SOURCE_SHA/);
  assert.ok(workflow.includes('environment:\n      name: qa2'));
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 7/);
});

test('QA2 server audit gathers only technical capacity and process evidence', () => {
  for (const required of [
    'df -hT', 'df -iP', 'free -h', 'swapon --show --bytes', 'vmstat 1 3', '/proc/pressure/memory',
    '/proc/pressure/io', '/proc/pressure/cpu', 'PORT_8002_PID', 'PROCESS_8002_EXEC',
    'PROCESS_8002_CWD', 'PROCESS_8002_CGROUP_BEGIN', 'ActiveState',
    'FragmentPath', 'PROCESS_8002_CMD', 'server_name[[:space:]]', 'docker image ls', 'docker volume ls',
    'docker builder du', 'technical-directory-sizes', 'source_sha',
    'synthetic_translation RU_TO_ZH', 'synthetic_translation ZH_TO_RU',
    'synthetic_translation EN_TO_ZH', 'pswpin', 'pswpout',
  ]) {
    assert.ok(workflow.includes(required), `missing required read-only evidence: ${required}`);
  }
  assert.match(workflow, /allowed = \('status', 'source_sha', 'version', 'private', 'translation_model', 'speech_model', 'languages'\)/);
  assert.match(workflow, /sanitized': True/);
  assert.doesNotMatch(workflow, /printenv|env\s*\||\.env|Authorization:|Bearer\s+/i);
});

test('QA2 server audit rejects server-mutating commands', () => {
  const forbidden = [
    /\brm\b/i,
    /\bprune\b/i,
    /\bkill\b/i,
    /\bsystemctl\s+(?:start|stop|restart|reload|enable|disable)\b/i,
    /\bdocker\s+(?:rm|rmi)\b/i,
    /\bdocker\s+(?:system|image|volume|builder)\s+prune\b/i,
    /\bnginx\s+-s\b/i,
    /\b(?:rsync|scp)\b/i,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(workflow, pattern);
});
