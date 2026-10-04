import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/configure-qa2-apns.yml'),
  'utf8',
);
const recovery = fs.readFileSync(path.join(root, 'scripts/qa2_apns_recovery.py'), 'utf8');

test('QA2 APNs workflow is environment-scoped and does not use privileged PR triggers', () => {
  assert.match(workflow, /environment:\s*\n\s*name: qa2/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\s*\n\s*tags:\s*\n[\s\S]*qa2-apns-apply-\*/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /test "\$GITHUB_REF_NAME" = "qa2\/integration-candidate"/);
  assert.match(workflow, /test "\$QA_SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(workflow, /\^qa2-apns-apply-\(\[0-9a-f\]\{40\}\)\$/);
  assert.match(workflow, /test "\$\{BASH_REMATCH\[1\]\}" = "\$GITHUB_SHA"/);
  assert.match(workflow, /test "\$QA_SOURCE_SHA" = "\$\(git rev-parse origin\/qa2\/integration-candidate\)"/);
});

test('QA2 APNs workflow validates all secret names and TestFlight contract without printing values', () => {
  for (const name of [
    'QA2_APNS_KEY_ID',
    'QA2_APNS_TEAM_ID',
    'QA2_APNS_AUTH_KEY_P8_BASE64',
    'QA2_APNS_BUNDLE_ID',
    'QA2_APNS_USE_SANDBOX',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${name}`));
  }
  assert.match(workflow, /APNS_BUNDLE_ID.*com\.urtruck\.app/);
  assert.match(workflow, /APNS_USE_SANDBOX.*false/);
  assert.match(workflow, /base64\.b64decode\(.*validate=True/);
  assert.match(workflow, /load_pem_private_key/);
  assert.doesNotMatch(workflow, /echo "\$QA2_APNS_/);
});

test('QA2 APNs workflow preserves FCM and outbox state while providing rollback', () => {
  assert.match(workflow, /qa2_apns_recovery\.py/);
  assert.match(recovery, /APNS_AUTH_KEY_P8_BASE64/);
  assert.match(recovery, /APNS_AUTH_KEY_P8/);
  assert.doesNotMatch(workflow, /PUSH_OUTBOX_CUTOFF_ID/);
  assert.match(workflow, /QA2_FCM_REGRESSION/);
  assert.match(workflow, /QA2_APNS_ROLLBACK/);
  assert.match(recovery, /\.apns-backup\./);
  assert.match(workflow, /Remove confirmed primary recovery material/);
  assert.match(workflow, /Always remove only temporary APNs key material/);
  assert.match(workflow, /rm -f -- \/tmp\/urtruck-qa2-apns\.env/);
});
