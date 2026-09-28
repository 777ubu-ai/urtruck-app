import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/qa2-server-readonly-audit.yml', 'utf8');
const script = readFileSync('scripts/qa2_server_readonly_audit.sh', 'utf8');
const combined = `${workflow}\n${script}`;

test('QA2 server audit is manual, QA2-approved and uploads a short-lived sanitized artifact', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\n\s+name: qa2/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /qa2-server-readonly-audit-\$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /SERVER_HOST: \$\{\{ secrets\.SERVER_HOST \}\}/);
  assert.doesNotMatch(workflow, /push:\n/);
  assert.doesNotMatch(workflow, /refs\/heads\/main|production-deploy/);
});

test('audit measures requested evidence and three synthetic translations without response bodies', () => {
  for (const marker of ['df -hT', 'df -i', 'free -h', 'swapon --show --bytes', 'vmstat 1 3', '/proc/pressure/memory', '/proc/pressure/cpu', '/proc/pressure/io', 'sport = :8002', 'urtruck-qa2.service', 'docker system df -v', 'server_name', 'proxy_pass', 'synthetic_translation_load', 'pswpin', 'pswpout']) {
    assert.ok(script.includes(marker), `missing ${marker}`);
  }
  assert.match(script, /cases = \[/);
  assert.match(script, /response\.read\(\)/);
  assert.doesNotMatch(script, /translated_text|transcript|chat_messages|\.env/);
});

test('audit contract prohibits server-mutating commands', () => {
  const forbidden = [
    /\bdocker\s+(?:system\s+)?prune\b/i,
    /\bdocker\s+(?:rm|rmi)\b/i,
    /\bsystemctl\s+(?:restart|stop|start)\b/i,
    /\bkill(?:all)?\b/i,
    /(?:^|[;&|]\s*)rm\s+-/im,
    /\bdeploy(?:\.sh)?\b/i,
    /\bjournalctl\s+--vacuum/i,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(combined, pattern, pattern.toString());
});
