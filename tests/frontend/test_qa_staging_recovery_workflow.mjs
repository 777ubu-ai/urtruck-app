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

test('QA2 recovery is manual, pinned and production-safe', () => {
  assert.match(workflow, /RECOVER_QA2/);
  assert.match(workflow, /QA_SOURCE_SHA: 7b73ca90c123dd889b924313e05c8adc3e0113ee/);
  assert.match(workflow, /QA recovery URL must not point to production/);
  assert.match(workflow, /https:\/\/urtruck\.kz\/api\/version/);
  assert.match(workflow, /Production fingerprint changed during QA2 recovery/);
});

test('QA2 recovery preserves data and requires a free listener port', () => {
  assert.match(workflow, /QA_RECOVERY_PORT_8002_NOT_FREE/);
  assert.match(workflow, /DB_PATH_HASH/);
  assert.match(workflow, /DB_INODE/);
  assert.match(workflow, /STORAGE_INODE/);
  assert.match(workflow, /QA_RECOVERY_DB=preserved-same-file/);
  assert.match(workflow, /QA_RECOVERY_STORAGE=preserved-same-directory/);
});

test('QA2 recovery builds an isolated runtime and binds the existing QA env', () => {
  assert.match(workflow, /python3 -m venv venv/);
  assert.match(workflow, /ln -s \.\.\/\.env \.env/);
  assert.match(workflow, /nohup env -i HOME=/);
  assert.match(workflow, /-m uvicorn main:app --host 0\.0\.0\.0 --port 8002/);
  assert.match(workflow, /env in \{"", "unset", "production"\}/);
  assert.match(workflow, /beta_bypass_on_prod/);
});

test('QA2 recovery has code backup and rollback without touching QA data', () => {
  assert.match(workflow, /backend-code-recovery-/);
  assert.match(workflow, /QA_RECOVERY_ROLLBACK=restored-/);
  assert.doesNotMatch(workflow, /--exclude='database\/'/);
  assert.match(workflow, /--exclude='\*\.db'/);
  assert.match(workflow, /--exclude='\*\.db-wal'/);
  assert.match(workflow, /--exclude='\*\.db-shm'/);
  assert.match(workflow, /--exclude='\*\.db-journal'/);
  assert.match(workflow, /--exclude='storage\/'/);
  assert.match(workflow, /--exclude='\.env'/);
  assert.match(workflow, /database\/vehicles_dal\.py/);
  assert.match(workflow, /QA_RECOVERY_DATABASE_CODE_MISSING/);
  assert.match(workflow, /rm -rf "\$qa_backend\/venv"/);
});

test('QA Center exposes recovery without running strict health gates concurrently', () => {
  assert.match(qaCenter, /recover_qa2:/);
  assert.match(qaCenter, /qa2_recovery_confirmation:/);
  assert.match(qaCenter, /uses: \.\/\.github\/workflows\/qa-staging-recovery\.yml/);
  assert.match(qaCenter, /inputs\.recover_qa2 == true/);
  assert.match(qaCenter, /inputs\.recover_qa2 != true/);
  assert.match(qaCenter, /confirmation: \$\{\{ inputs\.qa2_recovery_confirmation \}\}/);
});
