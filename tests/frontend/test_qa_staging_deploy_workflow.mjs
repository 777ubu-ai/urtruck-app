import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-staging-deploy.yml'),
  'utf8',
);
const qaCenter = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-center.yml'),
  'utf8',
);
const recoveryWorkflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-staging-recovery.yml'),
  'utf8',
);
const webWorkflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa2-web-deploy.yml'),
  'utf8',
);
const androidWorkflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/build-android-apk.yml'),
  'utf8',
);

test('ordinary QA2 workflows never reference the separate UrTruck Pro Test contour', () => {
  for (const source of [workflow, qaCenter, recoveryWorkflow, androidWorkflow]) {
    assert.doesNotMatch(source, /PRO_TEST_|pro-test|urtruck-pro-test|com\.urtruck\.protest/i);
  }
  assert.doesNotMatch(workflow, /QA2_OPENAI_API_KEY/);
  assert.match(recoveryWorkflow, /SERVER_HOST:\n\s+required: true/);
  assert.match(androidWorkflow, /QA2_ANDROID_GOOGLE_SERVICES_JSON_BASE64/);
});

test('QA2 backend deploy is manual, fixed-source and gated by QA contracts', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /QA_SOURCE_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /prevents a new QA APK from silently testing an older server/);
  assert.match(workflow, /needs: \[environment-contract, staging-preflight\]/);
  assert.match(workflow, /QA2_API_URL/);
  assert.match(workflow, /SERVER_HOST:\n\s+required: true/);
  assert.match(workflow, /SERVER_USER:\n\s+required: true/);
  assert.match(workflow, /SERVER_PASS:\n\s+required: true/);
  assert.match(workflow, /DEPLOY_QA2/);
});

test('QA2 backend deploy protects database, storage and production', () => {
  assert.match(workflow, /\/home\/ubuntu\/urtruck-qa2/);
  assert.match(workflow, /sport = :8002/);
  assert.match(workflow, /--port 8002/);
  assert.doesNotMatch(workflow, /--exclude='database\/'/);
  assert.match(workflow, /--exclude='\*\.db'/);
  assert.match(workflow, /--exclude='\*\.db-wal'/);
  assert.match(workflow, /--exclude='\*\.db-shm'/);
  assert.match(workflow, /--exclude='\*\.db-journal'/);
  assert.match(workflow, /--exclude='storage\/'/);
  assert.match(workflow, /--exclude='\.env'/);
  assert.match(workflow, /database\/vehicles_dal\.py/);
  assert.match(workflow, /QA_DEPLOY_DATABASE_CODE_MISSING/);
  assert.match(workflow, /QA_DB=preserved-same-file/);
  assert.match(workflow, /QA_STORAGE=preserved-same-directory/);
  assert.match(workflow, /PROD_VERSION_HASH_BEFORE/);
  assert.match(workflow, /Production version fingerprint changed during QA-only deploy/);
});

test('QA2 backend deploy has rollback and self-contained runtime QA2P isolation proof', () => {
  assert.match(workflow, /Roll back QA2 code and settings if deploy validation fails/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /QA_ROLLBACK=restored-/);
  assert.match(workflow, /QA2P_RUNTIME_FIXTURE=seeded/);
  assert.match(workflow, /QA2P_RUNTIME_FIXTURE=cleaned/);
  assert.match(workflow, /INSERT INTO cargos/);
  assert.match(workflow, /DELETE FROM cargos WHERE id=\? AND owner_id=\? AND cargo_desc=\?/);
  assert.match(workflow, /QA2P_RUNTIME_FIXTURE_ID_COLLISION/);
  assert.match(workflow, /QA2P_RUNTIME_FIXTURE_NOT_VISIBLE_IN_QA/);
  assert.match(workflow, /QA2P_RUNTIME_LEAKED_TO_PRODUCTION/);
  assert.match(workflow, /'from_city': marker/);
  assert.match(workflow, /trap 'qa_fixture cleanup \|\| true' EXIT/);
  assert.match(workflow, /pytest tests\/test_qa_data_isolation\.py -q/);
});

test('QA Center keeps deploy opt-in and waits for every existing gate', () => {
  assert.match(qaCenter, /deploy_qa2:/);
  assert.match(qaCenter, /qa2_confirmation:/);
  assert.match(qaCenter, /inputs\.deploy_qa2 == true/);
  assert.match(qaCenter, /confirmation: \$\{\{ inputs\.qa2_confirmation \}\}/);
  assert.ok(qaCenter.includes('- qa2-environment-contract'));
  assert.ok(qaCenter.includes('- qa-staging-preflight'));
  assert.ok(qaCenter.includes('- routing-provider-forensic'));
  assert.ok(qaCenter.includes('- quick-gate'));
  assert.ok(qaCenter.includes('- maestro-contract'));
  assert.match(workflow, /workflow_call:/);
});

test('QA2 deploy treats an empty free-port probe as normal after stopping the listener', () => {
  assert.ok(workflow.includes('{ fuser -n tcp 8002 2>/dev/null || true; }'));
  assert.match(workflow, /QA_DEPLOY_PORT_8002_DID_NOT_RELEASE/);
  assert.match(workflow, /port_free=no/);
});

test('QA2 deploy waits for local health and emits only sanitized startup diagnostics', () => {
  assert.match(workflow, /for _ in \{1\.\.40\}; do/);
  assert.match(workflow, /QA_DEPLOY_LOCAL_HEALTH_TIMEOUT/);
  assert.match(workflow, /QA_DEPLOY_UVICORN_LOG=present/);
  assert.match(workflow, /tail -n 160 uvicorn\.log/);
  assert.match(workflow, /<redacted>/);
  assert.doesNotMatch(workflow, /cat "\\$qa_root\/\.env"/);
});

test('QA2 deploy preserves private local AI and rejects provider substitution', () => {
  assert.match(workflow, /Verify QA2 local AI policy before any server mutation/);
  assert.match(workflow, /QA2_LOCAL_AI_POLICY_OPENAI_SUBSTITUTION_BLOCKED/);
  assert.match(workflow, /QA2_LOCAL_AI_POLICY_BLOCKED_BEFORE_MUTATION/);
  assert.match(workflow, /QA2_LOCAL_AI_URL_POLICY_BLOCKED_BEFORE_MUTATION/);
  assert.match(workflow, /qa_env=\/home\/ubuntu\/urtruck-qa2\/\.env/);
  assert.match(workflow, /TRANSCRIBE_PROVIDER.*local_ai/);
  assert.match(workflow, /TRANSLATE_PROVIDER.*local_ai/);
  assert.match(workflow, /QA2_LOCAL_AI_PROVIDER_NOT_READY/);
  assert.match(workflow, /QA2_LOCAL_AI_SETTINGS_NOT_READY/);
  assert.match(workflow, /ENV_BACKUP=.*qa2\.env/);
  assert.match(workflow, /QA_ROLLBACK_LOCAL_AI_SETTINGS_NOT_RESTORED/);
  assert.doesNotMatch(workflow, /printf[^\n]*TRANSCRIBE_PROVIDER=openai/);
  assert.doesNotMatch(workflow, /printf[^\n]*TRANSLATE_PROVIDER=openai/);
  assert.doesNotMatch(workflow, /urtruck-security.*\.env/);
});

test('QA2 web and recovery route private signed audio to FastAPI, never index.html', () => {
  assert.match(webWorkflow, /Range request returns HTML/);
  for (const source of [webWorkflow, recoveryWorkflow]) {
    assert.match(source, /location \^~ \/qa2\/storage\//);
    assert.match(source, /location \^~ \/storage\//);
    assert.match(source, /location \^~ \/security\/storage\//);
    assert.match(source, /proxy_pass http:\/\/127\.0\.0\.1:8002\/storage\//);
  }
});
