import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = '3e1c845461a91c8c21531183c2259bb256c13588';
const branch = 'fix/play-production-1.0.15-20261109';
const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const guard = workflow.split('# BEGIN_PRODUCTION_1015_ARTIFACT_GUARD\n')[1]
  .split('# END_PRODUCTION_1015_ARTIFACT_GUARD')[0];
const prelude = `set -euo pipefail
git() {
  if [ "$1" = rev-parse ]; then echo "$TEST_HEAD";
  elif [ "$1" = diff ]; then test "$TEST_DIFF_OK" = true;
  else return 1; fi
}
gh() {
  case "$2" in
    */pulls/698) printf '{"head":{"sha":"%s"}}' "$TEST_PR_HEAD";;
    */check-runs*) printf '{"check_runs":[{"id":1,"name":"quality-gate / Backend tests","conclusion":"%s"},{"id":2,"name":"quality-gate / Frontend tests, lint, and build","conclusion":"success"},{"id":3,"name":"quality-gate / Mandatory web E2E subset","conclusion":"success"}]}' "$TEST_CI";;
    *) return 1;;
  esac
}
python3() { test "$*" = "scripts/prepare_store_candidate_version.py --platform android --version 1.0.15 --source-sha $URTRUCK_SOURCE_SHA"; }
`;
function run(patch = {}, submit = false, apk = false) {
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-play-1015-'));
  try {
    const script = guard.replaceAll("${{ inputs.submit_to_play && 'true' || 'false' }}", String(submit))
      .replaceAll("${{ inputs.build_installable_apk && 'true' || 'false' }}", String(apk));
    const result = spawnSync('bash', ['-c', prelude + script], { encoding: 'utf8', env: {
      ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: '777ubu-ai/urtruck-app',
      API_ENVIRONMENT_INPUT: 'production', TRACK_INPUT: 'production', RELEASE_STATUS_INPUT: 'draft',
      PRODUCTION_REVIEW_ONLY: 'false', SOURCE_SHA_OVERRIDE: source, URTRUCK_SOURCE_SHA: source,
      EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED: 'true', GITHUB_SHA: 'workflow',
      TEST_HEAD: source, TEST_PR_HEAD: source, TEST_CI: 'success', TEST_DIFF_OK: 'true',
      GITHUB_ENV: join(dir, 'env'), ...patch,
    } });
    return { status: result.status, output: result.stderr,
      prepared: result.status === 0 ? readFileSync(join(dir, 'env'), 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('production 1.0.15: готовится точный исходник с зелёным CI без upload', () => {
  const r = run(); assert.equal(r.status, 0, r.output);
  assert.match(r.prepared, /URTRUCK_VERSION_NAME=1\.0\.15/);
  assert.match(r.prepared, /URTRUCK_BUILD_FLAVOR=production/);
});
for (const patch of [
  { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REPOSITORY: 'other/repo' },
  { API_ENVIRONMENT_INPUT: 'qa2' }, { TRACK_INPUT: 'internal' },
  { RELEASE_STATUS_INPUT: 'completed' }, { PRODUCTION_REVIEW_ONLY: 'true' },
  { SOURCE_SHA_OVERRIDE: 'bad' }, { URTRUCK_SOURCE_SHA: 'bad' }, { TEST_HEAD: 'bad' },
  { TEST_PR_HEAD: 'new-unreviewed-head' }, { TEST_CI: 'failure' },
  { TEST_DIFF_OK: 'false' }, { EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED: 'false' },
]) {
  test(`production 1.0.15: отклоняет ${JSON.stringify(patch)}`, () => assert.notEqual(run(patch).status, 0));
}
test('production 1.0.15: upload и дополнительный APK запрещены', () => {
  assert.notEqual(run({}, true).status, 0); assert.notEqual(run({}, false, true).status, 0);
});
test('production 1.0.15: номер следует за прочитанным Play максимумом', () => {
  const section = workflow.split('- name: Compute collision-resistant versionCode\n')[1];
  const script = section.split('        run: |\n')[1].split('\n      - name:')[0]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-play-1015-version-'));
  try {
    const env = { ...process.env, GITHUB_REF_NAME: branch, VERIFIED_PLAY_MAX_CODE: '215771497', GITHUB_ENV: join(dir, 'env') };
    assert.equal(spawnSync('bash', ['-c', script], { env }).status, 0);
    assert.equal(readFileSync(env.GITHUB_ENV, 'utf8').trim(), 'URTRUCK_VERSION_CODE=215771498');
    assert.notEqual(spawnSync('bash', ['-c', script], { env: { ...env, VERIFIED_PLAY_MAX_CODE: '2100000000' } }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


// Исполняется только чистая проверка входного отчёта; никаких GitHub/store запросов.
const existingGateBlock = workflow.match(/# BEGIN_EXISTING_AAB_GATE\n([\s\S]*?)# END_GATE_FUNCTION/)[1];
const existingGatePython = existingGateBlock.split("python3 - <<'PYGATE'\n")[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
const acceptanceKeys = ['native_update_preserves_data','apple_google_login','cards_scroll_back','deal_chat_documents','real_push','gps_snapshot','play_console_restrictions','production_ids_personal_external'];
function acceptanceReport() {
  return { source_sha: '3e1c845461a91c8c21531183c2259bb256c13588', version: '1.0.15', version_code: 215771498,
    aab_sha256: 'a'.repeat(64), checks: Object.fromEntries(acceptanceKeys.map(key => [key, { status: 'PASS', evidence_url: 'https://example.invalid/synthetic-test-only' }])) };
}
function checkAcceptance(gate) {
  return spawnSync('python3', ['-c', existingGatePython + '\nvalidate_release_gate(json.loads(os.environ["SYNTHETIC_GATE"]))'], {
    env: { ...process.env, SYNTHETIC_GATE: JSON.stringify(gate) }, encoding: 'utf8',
  });
}
test('отправка готового AAB не запускает повторную сборку и сохраняет provenance/signature gates', () => {
  assert.equal(checkAcceptance(acceptanceReport()).status, 0);
  assert.notEqual(checkAcceptance({}).status, 0);
  assert.match(workflow, /inputs\.existing_aab_run_id == ''/);
  const job = workflow.split('  submit-existing-reviewed-aab:')[1].split('  download-google-signed-apk:')[0];
  assert.doesNotMatch(job, /gradlew|bundleRelease|eas build|setup-node/);
  assert.match(job, /hashlib\.sha256\(aab\.read_bytes\(\)\)/);
  assert.match(job, /bb2474c2ed08076f7141fe1e4d3f6c604fc3e860fe5811e3c2fcd129e7cb88b4/);
  assert.match(job, /run.get\('conclusion'\) == 'success'/);
  assert.match(job, /run.get\('head_sha'\) == '32d40da0027a978a31f2ceba7df7c1e58ff905e6'/);
});
for (const criterion of acceptanceKeys) {
  test('непройденная обязательная приёмка блокирует upload: ' + criterion, () => {
    const gate = acceptanceReport(); gate.checks[criterion].status = 'NOT RUN';
    assert.notEqual(checkAcceptance(gate).status, 0);
    gate.checks[criterion].status = 'PASS'; delete gate.checks[criterion].evidence_url;
    assert.notEqual(checkAcceptance(gate).status, 0);
  });
}
for (const [field, value] of [['source_sha','a'.repeat(40)],['version','1.0.14'],['version_code',215771497],['aab_sha256','bad']]) {
  test('чужая identity отчёта не допускается: ' + field, () => {
    const gate = acceptanceReport(); gate[field] = value;
    assert.notEqual(checkAcceptance(gate).status, 0);
  });
}


test('upload-only не обходит выбранный production_review_only', () => {
  const job = workflow.split('  submit-existing-reviewed-aab:')[1].split('  download-google-signed-apk:')[0];
  const prefix = job.split('run: |\n')[1].split('          gh api ')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const env = { ...process.env, GITHUB_REPOSITORY: '777ubu-ai/urtruck-app', GITHUB_REF_NAME: branch,
    AAB_RUN_ID: '42566989119', SOURCE_SHA: source, API_ENVIRONMENT: 'production', TRACK: 'production',
    RELEASE_STATUS: 'completed', SUBMIT_TO_PLAY: 'true', REVIEW_ONLY: 'false', BUILD_APK: 'false', FEED_ENABLED: 'true', DOWNLOAD_CODE: '' };
  assert.equal(spawnSync('bash', ['-c', prefix], { env }).status, 0);
  assert.notEqual(spawnSync('bash', ['-c', prefix], { env: { ...env, REVIEW_ONLY: 'true' } }).status, 0);
});


test('смешанные режимы не запускают дополнительный download APK с Play credentials', () => {
  const job = workflow.split('  download-google-signed-apk:')[1];
  const expression = job.match(/if: \$\{\{ (.*?) \}\}/)[1];
  const eligible = new Function('inputs', 'github', 'return ' + expression);
  const inputs = { download_generated_version_code: '215771497', inspect_store_only: false, existing_aab_run_id: '' };
  assert.equal(eligible(inputs, { event_name: 'workflow_dispatch' }), true);
  assert.equal(eligible({ ...inputs, existing_aab_run_id: '42566989119' }, { event_name: 'workflow_dispatch' }), false);
});
