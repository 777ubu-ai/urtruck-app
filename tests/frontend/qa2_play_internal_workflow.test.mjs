import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/submit-android-qa2-internal.yml', 'utf8');

test('Google Play Internal QA2 workflow pins the open candidate and all required checks', () => {
  assert.match(workflow, /source_sha:\n\s+description: Exact 40-character head SHA of open PR 561\n\s+required: true/);
  assert.match(workflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$QA_SOURCE_SHA"/);
  assert.match(workflow, /pulls\/561/);
  for (const check of [
    'quality-gate / Backend tests',
    'quality-gate / Frontend tests, lint, and build',
    'quality-gate / Mandatory web E2E subset',
  ]) assert.ok(workflow.includes(check), `missing required check: ${check}`);
});

test('Google Play release is hard-pinned to QA2 and the Internal track', () => {
  assert.ok(workflow.includes('test "$QA_HOST" = qa2.urtruck.kz'));
  assert.ok(workflow.includes('test "${QA2_API_URL%/}" != https://urtruck.kz'));
  assert.ok(workflow.includes('tracks: internal'));
  assert.ok(workflow.includes('packageName: com.urtruck.app'));
  assert.ok(workflow.includes('environment: production'), 'protected Environment approval is required');
  assert.ok(!workflow.includes('tracks: ${{ inputs.track'));
  assert.doesNotMatch(workflow, /EXPO_PUBLIC_API_URL:\s*https:\/\/urtruck\.kz(?:\s|$)/m);
});

test('QA2 AAB verifies the exact API host, Firebase, 16 KB alignment, and no background location', () => {
  assert.ok(workflow.includes('curl -fsS --max-time 20 "${QA2_API_URL%/}/health"'));
  assert.ok(workflow.includes('curl -fsS --max-time 20 "${QA2_API_URL%/}/api/version"'));
  assert.ok(workflow.includes('verify_android_firebase_config.py --check-resources'));
  assert.ok(workflow.includes('verify_android_fcm_handler.py'));
  assert.ok(workflow.includes('verify_android_16kb.py'));
  assert.ok(workflow.includes('grep -aFq "${QA2_API_URL%/}"'));
  assert.ok(workflow.includes('ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION'));
});
