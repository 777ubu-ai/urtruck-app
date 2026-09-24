import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-staging-recovery.yml'),
  'utf8',
);
const qaCenter = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-center.yml'),
  'utf8',
);

test('QA2 recovery is manual, exact-source and production-safe', () => {
  assert.match(workflow, /RECOVER_QA2/);
  assert.match(workflow, /QA_SOURCE_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /QA recovery URL must be exactly https:\/\/qa2\.urtruck\.kz/);
  assert.match(workflow, /https:\/\/urtruck\.kz\/api\/version/);
  assert.match(workflow, /Production fingerprint changed during QA2 recovery/);
});

test('QA2 bootstrap isolates runtime, database and persistent data', () => {
  assert.match(workflow, /qa_root=\/home\/ubuntu\/urtruck-qa2/);
  assert.match(workflow, /DB_PATH=\$qa_root\/database\/security\.db/);
  assert.match(workflow, /STORAGE_LOCAL_ROOT=\$qa_root\/storage/);
  assert.match(workflow, /QA_DATABASE_NOT_ISOLATED/);
  assert.match(workflow, /QA_RECOVERY_PROTECTED_PATHS=production-and-pro-untouched/);
  assert.match(workflow, /--exclude='\*\.db-wal'/);
  assert.match(workflow, /--exclude='storage\/'/);
  assert.match(workflow, /--exclude='\.env'/);
});

test('QA2 runtime is a dedicated service bound only to loopback port 8002', () => {
  assert.match(workflow, /\/etc\/systemd\/system\/urtruck-qa2\.service/);
  assert.match(workflow, /WorkingDirectory=\/home\/ubuntu\/urtruck-qa2\/backend/);
  assert.match(workflow, /--host 127\.0\.0\.1 --port 8002/);
  assert.match(workflow, /QA_RECOVERY_PORT_8002_NOT_FREE/);
  assert.match(workflow, /QA_RECOVERY_API_8002=healthy/);
});

test('QA2 voice and translation use only the QA2 OpenAI secret', () => {
  assert.match(workflow, /QA2_OPENAI_API_KEY/);
  assert.match(workflow, /TRANSCRIBE_MODEL=gpt-4o-mini-transcribe/);
  assert.match(workflow, /TRANSLATE_MODEL=gpt-4o-mini/);
  assert.match(workflow, /api\/v1\/chat\/translate\/info/);
  assert.match(workflow, /openai_key_exists/);
  assert.match(workflow, /QA_RECOVERY_TRANSLATION=healthy/);
  assert.doesNotMatch(workflow, /PRO_TEST_OPENAI_API_KEY/);
});

test('QA2 has a dedicated Nginx host and certificate', () => {
  assert.match(workflow, /server_name qa2\.urtruck\.kz/);
  assert.match(workflow, /proxy_pass http:\/\/127\.0\.0\.1:8002/);
  assert.match(workflow, /certbot --nginx/);
  assert.match(workflow, /QA_RECOVERY_TLS=valid/);
});

test('QA Center exposes isolated recovery and inherits repository secrets', () => {
  assert.match(qaCenter, /recover_qa2:/);
  assert.match(qaCenter, /uses: \.\/\.github\/workflows\/qa-staging-recovery\.yml/);
  assert.match(qaCenter, /inputs\.recover_qa2 == true/);
  assert.match(qaCenter, /confirmation: \$\{\{ inputs\.qa2_recovery_confirmation \}\}/);
  assert.match(qaCenter, /secrets: inherit/);
});
