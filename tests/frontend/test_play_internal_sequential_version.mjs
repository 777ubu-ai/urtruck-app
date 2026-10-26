import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const section = workflow.split('- name: Compute collision-resistant versionCode\n')[1];
const script = section.split('        run: |\n')[1].split('\n      - name:')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
for (const branch of ['qa2/integration-candidate', 'fix/play-production-1.0.12-20261026']) {
for (const [maximum, expected] of [['215090226', '215090227'], ['215090227', '215090228'], ['2099999998', '2099999999']]) {
  test(`Play ${branch}: максимум ${maximum} даёт ровно ${expected}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'urtruck-play-version-'));
    try {
      const file = join(dir, 'env');
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, GITHUB_REF_NAME: branch, VERIFIED_PLAY_MAX_CODE: maximum, GITHUB_ENV: file } });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(file, 'utf8').trim(), `URTRUCK_VERSION_CODE=${expected}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
for (const maximum of ['', 'invalid', '215090226;exit 0', '000215090226', '12', '2099999999', '2100000000']) {
  test(`Play ${branch}: неверный или исчерпанный максимум ${JSON.stringify(maximum)} отклоняется`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'urtruck-play-version-'));
    try {
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, GITHUB_REF_NAME: branch, VERIFIED_PLAY_MAX_CODE: maximum, GITHUB_ENV: join(dir, 'env') } });
      assert.notEqual(result.status, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
}
