import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/deploy-qa2-final-integration.yml'),
  'utf8',
);

test('final QA2 workflow is protected and exact-SHA only', () => {
  for (const required of [
    'workflow_dispatch:',
    'source_sha:',
    'DEPLOY_QA2_FINAL',
    'name: qa2',
    'qa2/integration-candidate',
    'QA_SOURCE_SHA',
    'git merge-base --is-ancestor',
  ]) assert.match(workflow, new RegExp(required.replace(/[.*+?^$()|[\]\\]/g, '\\$&')));
});

test('final QA2 workflow uses pinned SSH and systemd', () => {
  for (const required of [
    'SERVER_SSH_KEY',
    'SERVER_SSH_KNOWN_HOSTS',
    'StrictHostKeyChecking yes',
    'BatchMode yes',
    'systemctl restart urtruck-qa2.service',
    'systemctl restart urtruck-qa2-ai.service',
    'systemctl reload nginx',
  ]) assert.ok(workflow.includes(required), required);
  for (const forbidden of [
    'SERVER_PASS',
    'sshpass',
    'StrictHostKeyChecking=no',
    'nohup',
    'kill -TERM',
    'kill -KILL',
  ]) assert.ok(!workflow.includes(forbidden), forbidden);
});

test('final QA2 workflow has QA-only backup, rollback and evidence', () => {
  for (const required of [
    'code-only rollback backup',
    'Roll back only QA2 if final deployment fails',
    'PRODUCTION_VERSION_HASH_BEFORE',
    'PRODUCTION_FINGERPRINT_UNCHANGED=pass',
    '.qa-source-sha',
    'QA2_RUNTIME_SOURCE_SHA',
  ]) assert.ok(workflow.includes(required), required);
  for (const forbidden of ['com.urtruck.protest', 'urtruck-pro']) {
    assert.ok(!workflow.includes(forbidden), forbidden);
  }
});
