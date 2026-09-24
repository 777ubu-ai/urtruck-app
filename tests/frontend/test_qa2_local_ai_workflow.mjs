import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-local-ai.yml', 'utf8');
const recovery = fs.readFileSync('.github/workflows/qa-staging-recovery.yml', 'utf8');

test('local AI deploy is manual and QA2-only', () => {
  assert.match(workflow, /INSTALL_QA2_LOCAL_AI/);
  assert.match(workflow, /https:\/\/qa2\.urtruck\.kz/);
  assert.match(workflow, /\/home\/ubuntu\/urtruck-qa2-ai/);
  assert.match(workflow, /\/home\/ubuntu\/urtruck-qa2\/backend/);
  assert.doesNotMatch(workflow, /urtruck-pro/);
});

test('AI service is private and resource bounded', () => {
  assert.match(workflow, /--host 127\.0\.0\.1 --port 8003/);
  assert.match(workflow, /MemoryMax=5G/);
  assert.match(workflow, /CPUQuota=350%/);
  assert.match(workflow, /NoNewPrivileges=true/);
  assert.match(workflow, /0\.0\.0\.0:8003/);
});

test('pinned local models and required language smoke tests are present', () => {
  assert.match(workflow, /Systran\/faster-whisper-small/);
  assert.match(workflow, /facebook\/m2m100_418M/);
  assert.match(workflow, /auralmira\/m2m100-418M-ct2-int8/);
  assert.match(workflow, /e205afefce2fd6933a1dca3b92b5063894f2f2bb/);
  for (const pair of ["'ru', 'zh'", "'zh', 'ru'", "'kk', 'ru'", "'en', 'ru'"]) {
    assert.match(workflow, new RegExp(pair));
  }
});

test('production is fingerprinted and QA2 has rollback', () => {
  assert.match(workflow, /PROD_HASH_BEFORE/);
  assert.match(workflow, /PRODUCTION=healthy-unchanged/);
  assert.match(workflow, /Roll back QA2 backend on failure/);
  assert.match(workflow, /TRANSCRIBE_PROVIDER':'local_ai'/);
  assert.match(workflow, /TRANSLATE_PROVIDER':'local_ai'/);
});

test('registered QA2 recovery workflow exposes the isolated local AI mode', () => {
  assert.match(recovery, /inputs\.confirmation == 'INSTALL_QA2_LOCAL_AI'/);
  assert.match(recovery, /bash scripts\/deploy-qa2-local-ai\.sh/);
  assert.match(recovery, /inputs\.confirmation == 'RECOVER_QA2'/);
});
