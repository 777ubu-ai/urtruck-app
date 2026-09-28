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
  assert.match(workflow, /QA_AI_RAM_AVAILABLE_BYTES/);
  assert.match(workflow, /QA_AI_DISK_AVAILABLE_BYTES/);
  assert.match(workflow, /QA_AI_GPU=/);
});

test('QA2 recovery preserves private local AI and rolls back settings', () => {
  assert.doesNotMatch(workflow, /QA2_OPENAI_API_KEY/);
  assert.match(workflow, /Verify QA2 local AI policy before recovery mutation/);
  assert.match(workflow, /QA2_LOCAL_AI_POLICY_OPENAI_SUBSTITUTION_BLOCKED/);
  assert.match(workflow, /QA2_LOCAL_AI_POLICY_BLOCKED_BEFORE_RECOVERY/);
  assert.match(workflow, /QA2_LOCAL_AI_URL_POLICY_BLOCKED_BEFORE_RECOVERY/);
  assert.match(workflow, /TRANSCRIBE_PROVIDER=local_ai/);
  assert.match(workflow, /TRANSLATE_PROVIDER=local_ai/);
  assert.match(workflow, /LOCAL_AI_URL=http:\/\/127\.0\.0\.1:8003/);
  assert.match(workflow, /api\/v1\/chat\/translate\/info/);
  assert.match(workflow, /QA2_LOCAL_AI_PROVIDER_NOT_READY/);
  assert.match(workflow, /QA_RECOVERY_LOCAL_AI=healthy/);
  assert.match(workflow, /Roll back QA2 code and settings if recovery fails/);
  assert.match(workflow, /QA_RECOVERY_ROLLBACK_LOCAL_AI_SETTINGS_NOT_RESTORED/);
  assert.doesNotMatch(workflow, /printf[^\n]*TRANSCRIBE_PROVIDER=openai/);
  assert.doesNotMatch(workflow, /printf[^\n]*TRANSLATE_PROVIDER=openai/);
  assert.doesNotMatch(workflow, /PRO_TEST_OPENAI_API_KEY/);
});

test('QA2 exposes a diagnostic-only local AI runner without mutation commands', () => {
  assert.match(workflow, /DIAGNOSE_QA2_LOCAL_AI/);
  assert.match(workflow, /qa2_ai_readonly_diagnostic\.py/);
  assert.match(workflow, /df -h \/home\/ubuntu/);
  assert.match(workflow, /du -sh \/home\/ubuntu\/urtruck-qa2-ai/);
  assert.match(workflow, /free -h/);
  assert.match(workflow, /systemctl show urtruck-qa2-ai\.service/);
  assert.match(workflow, /QA2_DIAGNOSTIC_QUALITY_PATH/);
  assert.match(workflow, /sudo -n env .*\/home\/ubuntu\/urtruck-qa2-ai\/venv\/bin\/python/);
  assert.match(workflow, /PYTHONDONTWRITEBYTECODE=1/);
  assert.match(workflow, /\/tmp\/qa2-ai-readonly-diagnostic-\[0-9\]\*/);
  assert.match(workflow, /sudo -n rm -rf -- '\$remote_dir'/);
  assert.match(workflow, /test ! -e '\$remote_dir'/);
  assert.doesNotMatch(workflow, /QA2_DIAGNOSTIC_SAFE_CORPUS=1/);
  assert.doesNotMatch(workflow, /QA2_DIAGNOSTIC_VOICE_ONLY=1/);
  assert.doesNotMatch(workflow, /diagnose_ai[\s\S]*systemctl restart/);
});

test('QA2 cleanup job can remove only the exact failed diagnostic directory', () => {
  assert.match(workflow, /CLEANUP_QA2_DIAGNOSTIC_TMP/);
  assert.match(workflow, /target='\/tmp\/qa2-ai-readonly-diagnostic-36409260200'/);
  assert.match(workflow, /test "\$target" = '\/tmp\/qa2-ai-readonly-diagnostic-36409260200'/);
  assert.match(workflow, /sudo -n rm -rf -- '\$target'/);
  assert.doesNotMatch(workflow, /cleanup_diagnostic_tmp[\s\S]*\/tmp\/qa2-ai-readonly-diagnostic-\*/);
});

test('QA2 has a dedicated Nginx host and certificate', () => {
  assert.match(workflow, /server_name qa2\.urtruck\.kz/);
  assert.match(workflow, /proxy_pass http:\/\/127\.0\.0\.1:8002/);
  assert.match(workflow, /certbot --nginx/);
  assert.match(workflow, /QA_RECOVERY_TLS=valid/);
  assert.match(workflow, /location \^~ \/qa2\/storage\//);
  assert.match(workflow, /location \^~ \/storage\//);
  assert.match(workflow, /location \^~ \/security\/storage\//);
  assert.match(workflow, /proxy_pass http:\/\/127\.0\.0\.1:8002\/storage\//);
});

test('QA Center exposes isolated recovery and inherits repository secrets', () => {
  assert.match(qaCenter, /recover_qa2:/);
  assert.match(qaCenter, /uses: \.\/\.github\/workflows\/qa-staging-recovery\.yml/);
  assert.match(qaCenter, /inputs\.recover_qa2 == true/);
  assert.match(qaCenter, /confirmation: \$\{\{ inputs\.qa2_recovery_confirmation \}\}/);
  assert.match(qaCenter, /secrets: inherit/);
});
