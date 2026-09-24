import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-local-ai.yml', 'utf8');
const recovery = fs.readFileSync('.github/workflows/qa-staging-recovery.yml', 'utf8');
const script = fs.readFileSync('scripts/deploy-qa2-local-ai.sh', 'utf8');
const deployment = workflow + '\n' + script;

test('local AI deploy is manual and QA2-only', () => {
  assert.match(deployment, /INSTALL_QA2_LOCAL_AI/);
  assert.match(deployment, /https:\/\/qa2\.urtruck\.kz/);
  assert.match(deployment, /\/home\/ubuntu\/urtruck-qa2-ai/);
  assert.match(deployment, /\/home\/ubuntu\/urtruck-qa2\/backend/);
  assert.doesNotMatch(deployment, /urtruck-pro/);
});

test('AI service is private and resource bounded', () => {
  assert.match(deployment, /--host 127\.0\.0\.1 --port 8003/);
  assert.match(deployment, /MemoryMax=5G/);
  assert.match(deployment, /CPUQuota=350%/);
  assert.match(deployment, /NoNewPrivileges=true/);
  assert.match(deployment, /0\.0\.0\.0:8003/);
});

test('pinned local models and required language smoke tests are present', () => {
  assert.match(deployment, /Systran\/faster-whisper-small/);
  assert.match(deployment, /facebook\/m2m100_418M/);
  assert.match(deployment, /auralmira\/m2m100-418M-ct2-int8/);
  assert.match(deployment, /e205afefce2fd6933a1dca3b92b5063894f2f2bb/);
  for (const pair of ["'ru', 'zh'", "'zh', 'ru'", "'kk', 'ru'", "'en', 'ru'"]) {
    assert.match(deployment, new RegExp(pair));
  }
});

test('production is fingerprinted and QA2 has rollback', () => {
  assert.match(deployment, /prod_before/);
  assert.match(deployment, /PRODUCTION=healthy-unchanged/);
  assert.match(deployment, /rollback\(\)/);
  assert.match(deployment, /QA2_AI_TRANSCRIPTION_EN=healthy/);
  assert.match(deployment, /TRANSCRIBE_PROVIDER':'local_ai'/);
  assert.match(deployment, /TRANSLATE_PROVIDER':'local_ai'/);
});

test('registered QA2 recovery workflow exposes the isolated local AI mode', () => {
  assert.match(recovery, /inputs\.confirmation == 'INSTALL_QA2_LOCAL_AI'/);
  assert.match(recovery, /bash scripts\/deploy-qa2-local-ai\.sh/);
  assert.match(recovery, /inputs\.confirmation == 'RECOVER_QA2'/);
});
