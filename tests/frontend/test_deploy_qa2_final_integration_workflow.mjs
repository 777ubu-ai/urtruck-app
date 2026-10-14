import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readWorkflow = (name) => fs.readFileSync(
  path.join(root, '.github/workflows', name), 'utf8',
);
const finalDeploy = readWorkflow('deploy-qa2-final-integration.yml');
const routing = readWorkflow('configure-qa2-routing-secure.yml');
const cgr = readWorkflow('verify-qa2-cgr-live.yml');

const assertPresent = (source, values) => {
  for (const value of values) assert.ok(source.includes(value), value);
};
const assertAbsent = (source, values) => {
  for (const value of values) assert.ok(!source.includes(value), value);
};

test('final QA2 deployment is protected and exact-SHA only', () => {
  assertPresent(finalDeploy, [
    'workflow_dispatch:', 'source_sha:', 'DEPLOY_QA2_FINAL', 'name: qa2',
    'qa2/integration-candidate', 'git merge-base --is-ancestor',
    'PRODUCTION_VERSION_HASH_BEFORE', 'PRODUCTION_FINGERPRINT_UNCHANGED=pass',
    'Roll back only QA2 if final deployment fails', '.qa-source-sha',
  ]);
});

test('final QA2 deployment uses pinned SSH and systemd', () => {
  assertPresent(finalDeploy, [
    'SERVER_SSH_KEY', 'SERVER_SSH_KNOWN_HOSTS', 'StrictHostKeyChecking yes',
    'BatchMode yes', 'systemctl restart urtruck-qa2.service',
    'systemctl restart urtruck-qa2-ai.service', 'systemctl reload nginx',
    'Type=simple', 'WorkingDirectory=/home/ubuntu/urtruck-qa2/backend',
    'ExecStart=/home/ubuntu/urtruck-qa2/backend/venv/bin/python -m uvicorn',
    'QA2_SYSTEMD_SUPERVISION=active_listener_in_unit_cgroup',
    'old_cwd', '"$QA_ROOT/backend"',
  ]);
  assertAbsent(finalDeploy, [
    'SERVER_PASS', 'sshpass', 'StrictHostKeyChecking=no', 'nohup',
    'com.urtruck.protest', 'urtruck-pro',
  ]);
  assert.ok(finalDeploy.indexOf('old_cwd=') < finalDeploy.indexOf('kill -TERM'));
});

test('secure routing path is protected, reversible and systemd-based', () => {
  assertPresent(routing, [
    'CONFIGURE_QA2_ROUTING_SECURE', 'source_sha:', 'name: qa2',
    'qa2/integration-candidate', 'SERVER_SSH_KEY', 'SERVER_SSH_KNOWN_HOSTS',
    'StrictHostKeyChecking yes', 'systemctl restart urtruck-qa2.service',
    'Roll back only QA2 routing env after failure', 'QA2_ROUTING_PROVIDER_NONE',
  ]);
  assertAbsent(routing, [
    'SERVER_PASS', 'sshpass', 'StrictHostKeyChecking=no', 'nohup',
    'kill -TERM', 'kill -KILL',
  ]);
});

test('CGR verification reports live evidence and treats 404/503 as blocked', () => {
  assertPresent(cgr, [
    'VERIFY_QA2_CGR_LIVE', 'source_sha:', 'name: qa2',
    'qa2/integration-candidate', 'nur_zholy_horgos dostyk_alashankou bahty_pokitu',
    '404|503', 'blocked-http', 'actions/upload-artifact@v4',
  ]);
  assertAbsent(cgr, ['com.urtruck.protest', 'urtruck-pro']);
});
