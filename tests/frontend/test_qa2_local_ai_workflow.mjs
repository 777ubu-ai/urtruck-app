import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-local-ai.yml', 'utf8');
const recovery = fs.readFileSync('.github/workflows/qa-staging-recovery.yml', 'utf8');
const script = fs.readFileSync('scripts/deploy-qa2-local-ai.sh', 'utf8');
const deployment = workflow + '\n' + script;

test('local AI deploy is manual and QA2-only', () => {
  assert.match(deployment, /INSTALL_QA2_LOCAL_AI/);
  assert.match(workflow, /source_sha/);
  assert.match(workflow, /environment:\s+name: qa2/);
  assert.match(workflow, /3678612761b793d42c66a99214640b28e81b81bd/);
  assert.match(deployment, /https:\/\/qa2\.urtruck\.kz/);
  assert.match(deployment, /\/home\/ubuntu\/urtruck-qa2-ai/);
  assert.match(deployment, /\/home\/ubuntu\/urtruck-qa2\/backend/);
  assert.doesNotMatch(deployment, /urtruck-pro/);
});

test('AI service is private and resource bounded', () => {
  assert.match(deployment, /--host 127\.0\.0\.1 --port 8003/);
  assert.match(deployment, /MemoryMax=6G/);
  assert.match(deployment, /CPUQuota=350%/);
  assert.match(deployment, /NoNewPrivileges=true/);
  assert.match(deployment, /0\.0\.0\.0:8003/);
});

test('pinned high-quality local models and 54-case language matrix are present', () => {
  assert.match(deployment, /dropbox-dash\/faster-whisper-large-v3-turbo/);
  assert.match(deployment, /0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf/);
  assert.match(deployment, /facebook\/nllb-200-distilled-1\.3B/);
  assert.match(deployment, /7be3e24664b38ce1cac29b8aeed6911aa0cf0576/);
  assert.match(deployment, /QA2_AI_TRANSLATION_MATRIX=54\/54/);
  assert.match(deployment, /language=en/);
  for (const pair of ["'ru','zh'", "'zh','ru'", "'en','zh'", "'zh','en'", "'ru','en'", "'en','ru'"]) {
    assert.match(deployment, new RegExp(pair));
  }
});

test('production is fingerprinted and AI-only rollback is prepared', () => {
  assert.match(deployment, /prod_before/);
  assert.match(deployment, /PRODUCTION=healthy-unchanged/);
  assert.match(deployment, /rollback\(\)/);
  assert.match(deployment, /QA2_AI_TRANSCRIPTION_EN=healthy/);
  assert.match(deployment, /QA2_AI_BACKUP_READY=code-and-unit/);
  assert.match(deployment, /QA2_BACKEND=unchanged/);
  assert.doesNotMatch(script, /\/home\/ubuntu\/urtruck-qa2\/\.env/);
  assert.doesNotMatch(script, /TRANSCRIBE_PROVIDER|TRANSLATE_PROVIDER/);
  assert.doesNotMatch(script, /urtruck-qa2\/backend\/(services|api)\/.*\.(py|env)/);
});

test('registered QA2 recovery workflow exposes the isolated local AI mode', () => {
  assert.match(recovery, /inputs\.confirmation == 'INSTALL_QA2_LOCAL_AI'/);
  assert.match(recovery, /bash scripts\/deploy-qa2-local-ai\.sh/);
  assert.match(recovery, /inputs\.confirmation == 'RECOVER_QA2'/);
});
