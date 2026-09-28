import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
    'PROCESS_8002_CWD', 'PROCESS_8002_CGROUP', 'ActiveState',
    'FragmentPath', 'server_name[[:space:]]', 'docker image ls', 'docker volume ls',
    'docker builder du', 'technical-directory-sizes', 'source_sha',
    'synthetic_translation RU_TO_ZH', 'synthetic_translation ZH_TO_RU',
    'synthetic_translation EN_TO_ZH', 'pswpin', 'pswpout',
  ]) {
    assert.ok(workflow.includes(required), `missing required read-only evidence: ${required}`);
  }
  assert.match(workflow, /allowed = \('status', 'source_sha', 'version', 'private', 'translation_model', 'speech_model', 'languages'\)/);
  assert.match(workflow, /sanitize_qa2_audit\.py/);
  assert.doesNotMatch(workflow, /PROCESS_8002_CMD/);
  assert.match(workflow, /SERVER_SSH_KNOWN_HOSTS/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(workflow, /StrictHostKeyChecking=no/);
  assert.doesNotMatch(workflow, /printenv|env\s*\||\.env|Authorization:|Bearer\s+/i);
});

test('allowlist artifact sanitizer removes command-line and header secrets from every output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa2-audit-'));
  const input = path.join(dir, 'input.txt');
  const json = path.join(dir, 'nested', 'audit.json');
  const markdown = path.join(dir, 'nested', 'summary.md');
  fs.writeFileSync(input, [
    'SECTION=port-8002-process',
    'PROCESS_8002_CMD=python --password example-secret --token=example-token',
    'PROCESS_8002_CGROUP_BEGIN',
    'cgroup=/system.slice/urtruck-qa2.service',
    'SECTION=health',
    'CUSTOM_SECRET=example-secret',
    'Authorization: Bearer example-token',
    'postgres://user:example-password@host/db',
    'SECTION=nginx-routing',
    'server_name qa2.urtruck.kz -> proxy_pass http://127.0.0.1:8002',
  ].join('\n'));
  const result = spawnSync('python3', ['scripts/sanitize_qa2_audit.py', input, json, markdown], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const published = `${fs.readFileSync(json, 'utf8')}\n${fs.readFileSync(markdown, 'utf8')}`;
  for (const secret of ['--password example-secret', '--token=example-token', 'postgres://user:example-password@host/db', 'Authorization: Bearer example-token']) {
    assert.equal(published.includes(secret), false, `secret leaked: ${secret}`);
  }
  assert.equal(published.includes('PROCESS_8002_CMD'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('representative server output keeps PID, latency, swap, PSI and sizes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa2-audit-fixture-'));
  const json = path.join(dir, 'audit.json');
  const markdown = path.join(dir, 'summary.md');
  const result = spawnSync(
    'python3',
    ['scripts/sanitize_qa2_audit.py', 'tests/fixtures/qa2_server_readonly_audit_sample.txt', json, markdown],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(fs.readFileSync(json, 'utf8'));
  const published = `${fs.readFileSync(json, 'utf8')}\n${fs.readFileSync(markdown, 'utf8')}`;
  assert.equal(payload.sanitized, true);
  assert.ok(payload.sections.listeners.includes('PORT_8002_PID=12345'));
  assert.ok(payload.sections['synthetic-translation-observation'].includes('SYNTHETIC_RU_TO_ZH_RESULT=200 8.420123'));
  assert.ok(payload.sections['synthetic-translation-observation'].some((line) => line.startsWith('SWAP_')));
  assert.ok(payload.sections['synthetic-translation-observation'].some((line) => line.startsWith('PSI_')));
  assert.match(published, /PORT_8002_PID=12345/);
  assert.match(published, /200 8\.420123/);
  assert.match(published, /AI_RU_TO_ZH_BEFORE_PROCESS=pid=1234 ppid=1 comm=python3 pcpu=2\.1 pmem=1\.2 rss=123456/);
  assert.match(published, /5\.6G \/home\/ubuntu\/urtruck-qa2/);
  assert.match(published, /1\.56G \/var\/lib\/docker/);
  assert.doesNotMatch(published, /example-secret|password|token|Authorization|postgres:/i);
  fs.rmSync(dir, { recursive: true, force: true });
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
