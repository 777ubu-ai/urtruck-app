import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/qa2-final-release-orchestrator.yml', 'utf8');

test('QA2 final release runs protected stages sequentially from candidate', () => {
  for (const marker of [
    'qa2/integration-candidate',
    '.qa2-release/run-final',
    'deploy-qa2-final-integration.yml',
    'configure-qa2-fcm.yml',
    'configure-qa2-routing-secure.yml',
    'configure-qa2-cgr.yml',
    'verify-qa2-cgr-live.yml',
    'build-android-apk.yml',
    'confirmation: DEPLOY_QA2_FINAL',
    'source_sha: ${{ github.sha }}',
    'source_ref: ${{ github.sha }}',
    'secrets: inherit',
  ]) assert.ok(workflow.includes(marker), `missing ${marker}`);

  assert.match(workflow, /configure-fcm:\n\s+needs: deploy/);
  assert.match(workflow, /configure-routing:\n\s+needs: configure-fcm/);
  assert.match(workflow, /configure-cgr:\n\s+needs: configure-routing/);
  assert.match(workflow, /verify-cgr:\n\s+needs: configure-cgr/);
  assert.match(workflow, /build-apk:\n\s+needs: verify-cgr/);
  assert.equal(workflow.includes('main'), false);
});
