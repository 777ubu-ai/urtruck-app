import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
function section(name) {
  const match = workflow.match(new RegExp(`# BEGIN_${name}\\n([\\s\\S]*?)# END_${name}`));
  assert.ok(match, `Отсутствует проверка ${name}`);
  return match[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
}
const script = `set -euo pipefail\n${section('PRODUCTION_REVIEW_GUARD')}\n${section('CANDIDATE_TARGET_GUARD')}`;
const base = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_NAME: 'qa2/integration-candidate',
  API_ENVIRONMENT_INPUT: 'production', TRACK_INPUT: 'production', RELEASE_STATUS_INPUT: 'draft',
  PRODUCTION_REVIEW_ONLY: 'true' };

for (const [name, override, allowed] of [
  ['production допускает только явно выбранный draft', {}, true],
  ['QA2/Internal сохраняет существующий путь', { API_ENVIRONMENT_INPUT: 'qa2', TRACK_INPUT: 'internal', PRODUCTION_REVIEW_ONLY: 'false' }, true],
  ['пустой новый флаг сохраняет прежний QA2/Internal', { API_ENVIRONMENT_INPUT: 'qa2', TRACK_INPUT: 'internal', PRODUCTION_REVIEW_ONLY: '' }, true],
  ['пустой флаг не разрешает production', { PRODUCTION_REVIEW_ONLY: '' }, false],
  ['production без явного режима отклоняется', { PRODUCTION_REVIEW_ONLY: 'false' }, false],
  ['completed не может включить публичный выпуск', { RELEASE_STATUS_INPUT: 'completed' }, false],
  ['inProgress не может включить поэтапный выпуск', { RELEASE_STATUS_INPUT: 'inProgress' }, false],
  ['halted не изменяет существующий rollout', { RELEASE_STATUS_INPUT: 'halted' }, false],
  ['production review не подменяется Internal', { TRACK_INPUT: 'internal' }, false],
  ['production review не подменяется alpha', { TRACK_INPUT: 'alpha' }, false],
  ['QA2 не попадает в production', { API_ENVIRONMENT_INPUT: 'qa2', PRODUCTION_REVIEW_ONLY: 'false' }, false],
  ['QA2 нельзя замаскировать режимом production review', { API_ENVIRONMENT_INPUT: 'qa2', TRACK_INPUT: 'internal' }, false],
  ['неизвестная среда отклоняется', { API_ENVIRONMENT_INPUT: 'other' }, false],
  ['режим review не запускается из push', { GITHUB_EVENT_NAME: 'push' }, false],
  ['режим review не запускается из непроверенной ветки', { GITHUB_REF_NAME: 'main' }, false],
]) {
  test(`Play: ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'urtruck-play-review-'));
    try {
      const envFile = join(root, 'env');
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, ...base, ...override, GITHUB_ENV: envFile } });
      assert.equal(result.status === 0, allowed, result.stderr);
      if (allowed && (override.API_ENVIRONMENT_INPUT || base.API_ENVIRONMENT_INPUT) === 'production') {
        assert.match(readFileSync(envFile, 'utf8'), /URTRUCK_BUILD_FLAVOR=production/);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
