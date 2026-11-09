import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = 'cfa18a51346da9ec9c364bae8cd79f7dd1eece62';
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
