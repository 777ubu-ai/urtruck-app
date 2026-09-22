import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-staging-deploy.yml'),
  'utf8',
);

test('QA2 backend deploy is manual, fixed-source and gated by QA contracts', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /QA_SOURCE_SHA: 7b73ca90c123dd889b924313e05c8adc3e0113ee/);
  assert.match(workflow, /needs: \[environment-contract, staging-preflight\]/);
  assert.match(workflow, /PRO_TEST_API_URL/);
  assert.match(workflow, /PRO_TEST_SERVER_HOST/);
  assert.match(workflow, /PRO_TEST_SERVER_USER/);
  assert.match(workflow, /PRO_TEST_SERVER_PASS/);
  assert.match(workflow, /DEPLOY_QA2/);
});

test('QA2 backend deploy protects database, storage and production', () => {
  assert.match(workflow, /\/home\/ubuntu\/urtruck-qa2/);
  assert.match(workflow, /sport = :8002/);
  assert.match(workflow, /--port 8002/);
  assert.match(workflow, /--exclude='database\/'/);
  assert.match(workflow, /--exclude='storage\/'/);
  assert.match(workflow, /--exclude='\.env'/);
  assert.match(workflow, /QA_DB=preserved-same-file/);
  assert.match(workflow, /QA_STORAGE=preserved-same-directory/);
  assert.match(workflow, /PROD_VERSION_HASH_BEFORE/);
  assert.match(workflow, /Production version fingerprint changed during QA-only deploy/);
});

test('QA2 backend deploy has rollback and runtime QA2P isolation proof', () => {
  assert.match(workflow, /Roll back QA2 code if deploy validation fails/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /QA_ROLLBACK=restored-/);
  assert.match(workflow, /QA2P_RUNTIME_FIXTURE_NOT_VISIBLE_IN_QA/);
  assert.match(workflow, /QA2P_RUNTIME_LEAKED_TO_PRODUCTION/);
  assert.match(workflow, /pytest tests\/test_qa_data_isolation\.py -q/);
});
