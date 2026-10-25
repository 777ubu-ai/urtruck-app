import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40);
const head = 'b'.repeat(40);
const names = ['Backend tests', 'Frontend tests, lint, and build', 'Mandatory web E2E subset'];
const checks = names.map((name, id) => ({ id, name: `quality-gate / ${name}`, conclusion: 'success' }));
const pr = { state: 'closed', merged: true, merge_commit_sha: sha,
  head: { sha: head, repo: { full_name: '777ubu-ai/urtruck-app' } }, base: { ref: 'qa2/integration-candidate' } };
const guards = [
  ['audit', 'build-android-apk', 'Require exact reviewed workflow source'],
  ['TestFlight', 'testflight-rc', 'Verify protected QA2 TestFlight intent'],
  ['Play', 'deploy-play', 'Prepare reviewed internal candidate identity'],
];
for (const [label, workflow, step] of guards) {
  const source = readFileSync(`.github/workflows/${workflow}.yml`, 'utf8');
  if (label !== 'audit') assert.ok(source.includes('pulls/605'), 'Сборка должна проверять PR605');
  const section = source.split(`- name: ${step}\n`)[1];
  assert.ok(section, step);
  const script = section.split('        run: |\n')[1].split(/\n      - (?:name:|uses:)/)[0]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n');
  for (const [scenario, override, valid] of [
    ['без внешнего approval', {}, true],
    ['последний CI неуспешен', { FAKE_CHECKS: JSON.stringify({ check_runs: [...checks, { ...checks[0], id: 99, conclusion: 'failure' }] }) }, false],
    ['CI отсутствует', { FAKE_CHECKS: '{"check_runs":[]}' }, false],
    ['PR не объединён', { FAKE_PR: JSON.stringify({ ...pr, merged: false }) }, false],
    ['другой merge SHA', { FAKE_PR: JSON.stringify({ ...pr, merge_commit_sha: head }) }, false],
    ['дерево исходников отличается', { FAKE_DIFF_STATUS: '1' }, false],
    ['другая ветка', { GITHUB_REF_NAME: 'main' }, false],
    ['другой checkout SHA', { FAKE_CHECKOUT: head }, false],
  ]) {
    test(`${label}: ${scenario}`, () => {
      const root = mkdtempSync(join(tmpdir(), 'urtruck-owner-release-'));
      try {
        const bin = join(root, 'bin'); mkdirSync(bin);
        const mocks = {
          gh: 'case "$*" in *reviews*) echo "Unexpected review dependency" >&2; exit 91;; *check-runs*) printf "%s" "$FAKE_CHECKS";; *) printf "%s" "$FAKE_PR";; esac',
          git: 'case "$1" in rev-parse) printf "%s" "$FAKE_CHECKOUT";; diff) exit "$FAKE_DIFF_STATUS";; fetch) exit 0;; *) exit 92;; esac',
          python3: 'if [ "$1" = - ]; then cat >/dev/null; printf "qa2.urtruck.kz\\n"; fi',
          curl: 'exit 0', npx: 'exit 0',
        };
        for (const [name, body] of Object.entries(mocks)) {
          const path = join(bin, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755);
        }
        const result = spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', env: {
          ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_ENV: join(root, 'env'),
          GITHUB_REPOSITORY: '777ubu-ai/urtruck-app', GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_REF_NAME: 'qa2/integration-candidate', GITHUB_SHA: sha, QA_SOURCE_SHA: sha, AUDIT_SOURCE_SHA: sha,
          CONFIRMATION: 'BUILD_QA2_TESTFLIGHT', URTRUCK_MIN_IOS_BUILD: '111',
          EXPO_TOKEN: 'test-only', EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY: 'test-only', EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY: 'test-only',
          QA2_API_URL: 'https://qa2.urtruck.kz', API_ENVIRONMENT_INPUT: 'qa2', TRACK_INPUT: 'internal',
          EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED: 'true', VERIFIED_PLAY_MAX_CODE: '215024884',
          FAKE_PR: JSON.stringify(pr), FAKE_CHECKS: JSON.stringify({ check_runs: checks }),
          FAKE_CHECKOUT: sha, FAKE_DIFF_STATUS: '0', ...override,
        } });
        assert.equal(result.status === 0, valid, `${result.stdout}\n${result.stderr}`);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}
