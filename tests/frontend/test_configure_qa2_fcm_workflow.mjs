import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/configure-qa2-fcm.yml', 'utf8');

test('QA2 FCM workflow uses pinned SSH and native systemd supervision', () => {
  assert.match(workflow, /SERVER_SSH_KNOWN_HOSTS/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /UserKnownHostsFile=/);
  assert.doesNotMatch(workflow, /StrictHostKeyChecking=no/);
  assert.doesNotMatch(workflow, /ssh-keyscan/);
  assert.match(workflow, /systemctl show -p MainPID/);
  assert.ok(workflow.includes('systemctl is-active urtruck-qa2.service'));
  assert.ok(workflow.includes('systemctl restart urtruck-qa2.service'));
  assert.match(workflow, /sport = :8002/);
});

test('QA2 FCM workflow has no manual process replacement', () => {
  for (const forbidden of ['nohup', 'kill -TERM', 'kill -KILL', 'uvicorn', '/proc/$pid/cmdline']) {
    assert.equal(workflow.includes(forbidden), false, 'forbidden: ' + forbidden);
  }
});

test('QA2 FCM workflow validates secrets and only writes native QA2 env', () => {
  for (const name of [
    'QA2_FCM_PROJECT_ID',
    'QA2_FCM_SERVICE_ACCOUNT_JSON',
    'QA2_ANDROID_GOOGLE_SERVICES_JSON_BASE64',
    'PUSH_PROVIDER_MODE',
    'FCM_PROJECT_ID',
    'FCM_SERVICE_ACCOUNT_JSON',
    'com.urtruck.app.qa2',
    'PROD_VERSION_HASH_BEFORE',
  ]) assert.ok(workflow.includes(name), 'missing ' + name);
  assert.equal(/echo\\s+.*QA2_FCM_(?:PROJECT_ID|SERVICE_ACCOUNT_JSON)/.test(workflow), false);
  assert.equal(/production.*\\.env/i.test(workflow), false);
});
