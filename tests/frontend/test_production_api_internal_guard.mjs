import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const android = fs.readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const ios = fs.readFileSync('.github/workflows/testflight-rc.yml', 'utf8');
const block = (text, start, end) => text.split(start)[1].split(end)[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
const base = { ...process.env, GITHUB_ENV: '/dev/null', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF_NAME: 'qa2/integration-candidate', API_ENVIRONMENT_INPUT: 'production',
  TRACK_INPUT: 'internal', PRODUCTION_INTERNAL_TEST: 'true', PRODUCTION_REVIEW_ONLY: 'false',
  RELEASE_STATUS_INPUT: 'completed', API_ENVIRONMENT: 'production',
  CONFIRMATION: 'BUILD_PRODUCTION_API_TESTFLIGHT', QA_HOST: 'urtruck.kz',
  QA2_API_URL: 'https://urtruck.kz', URTRUCK_BUILD_FLAVOR: 'production' };
function run(code, overrides = {}) {
  return spawnSync('/bin/bash', ['-c', 'set -eu\n' + code], { env: { ...base, ...overrides }, encoding: 'utf8' }).status;
}
const intent = block(android, '          PRODUCTION_REVIEW_ONLY="${PRODUCTION_REVIEW_ONLY:-false}"', '          # END_PRODUCTION_REVIEW_GUARD');
const target = block(android, '            # BEGIN_CANDIDATE_TARGET_GUARD', '            # END_CANDIDATE_TARGET_GUARD');
test('Android accepts explicit production API Internal and retains production draft route', () => {
  assert.equal(run(intent), 0);
  assert.equal(run(target), 0);
  assert.equal(run(intent, { PRODUCTION_INTERNAL_TEST: 'false', PRODUCTION_REVIEW_ONLY: 'true', TRACK_INPUT: 'production', RELEASE_STATUS_INPUT: 'draft' }), 0);
  assert.equal(run(target, { PRODUCTION_INTERNAL_TEST: 'false', PRODUCTION_REVIEW_ONLY: 'true', TRACK_INPUT: 'production', RELEASE_STATUS_INPUT: 'draft' }), 0);
});
for (const override of [
  { TRACK_INPUT: 'production' }, { API_ENVIRONMENT_INPUT: 'qa2' },
  { GITHUB_REF_NAME: 'main' }, { GITHUB_EVENT_NAME: 'push' },
  { PRODUCTION_REVIEW_ONLY: 'true' }, { RELEASE_STATUS_INPUT: 'inProgress' },
]) test('Android rejects mixed Internal intent ' + JSON.stringify(override), () => {
  assert.notEqual(run(intent, override), 0);
});
test('Android does not allow implicit production Internal', () => {
  assert.notEqual(run(target, { PRODUCTION_INTERNAL_TEST: 'false' }), 0);
  assert.equal(run(target, { PRODUCTION_INTERNAL_TEST: 'false', API_ENVIRONMENT_INPUT: 'qa2' }), 0);
});
const host = block(ios, '          if [ "${API_ENVIRONMENT:-qa2}" = production ]; then\n            test "$QA_HOST"', '          curl -fsS');
const hostCode = 'if [ "${API_ENVIRONMENT:-qa2}" = production ]; then\n  test "$QA_HOST"' + host;
test('iOS validates exact selected host and flavor', () => {
  assert.equal(run(hostCode), 0);
  assert.equal(run(hostCode, { API_ENVIRONMENT: 'qa2', QA_HOST: 'qa2.urtruck.kz', QA2_API_URL: 'https://qa2.urtruck.kz', URTRUCK_BUILD_FLAVOR: 'qa2' }), 0);
  for (const override of [{ QA2_API_URL: 'https://qa2.urtruck.kz' }, { QA_HOST: 'other.invalid' }, { URTRUCK_BUILD_FLAVOR: 'qa2' }, { API_ENVIRONMENT: 'qa2' }]) {
    assert.notEqual(run(hostCode, override), 0);
  }
});
test('Internal workflows preserve exact source, version cap and embedded configuration checks', () => {
  assert.match(ios, /URTRUCK_VERSION_NAME: 1\.0\.16/);
  assert.match(ios, /assert extra\['urtruckApiUrl'\].*os.environ\['QA2_API_URL'\]/);
  assert.match(ios, /test "\$GITHUB_SHA" = "\$QA_SOURCE_SHA"/);
  assert.match(ios, /codesign --verify --deep --strict/);
  assert.match(android, /CANDIDATE_VERSION=1\.0\.16/);
  assert.match(android, /node scripts\/verify-production-apk-config.mjs/);
});
