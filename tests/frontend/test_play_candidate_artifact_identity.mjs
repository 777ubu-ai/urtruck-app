import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const script = workflow.split("<<'NODEVERIFY'\n")[1].split('\n          NODEVERIFY')[0]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');
const sha = 'a'.repeat(40);
for (const [name, override, valid] of [
  ['актуальная версия 1.0.14', {}, true],
  ['устаревшая версия 1.0.12', { version: '1.0.12' }, false],
  ['подменённый исходник', { extra: { urtruckSourceSha: 'b'.repeat(40), urtruckExternalFreightFeedEnabled: true } }, false],
  ['отключённая лента', { extra: { urtruckSourceSha: sha, urtruckExternalFreightFeedEnabled: false } }, false],
]) {
  test(`AAB: ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'urtruck-aab-identity-'));
    try {
      const path = join(root, 'config.json');
      writeFileSync(path, JSON.stringify({ version: '1.0.14', extra: { urtruckSourceSha: sha, urtruckExternalFreightFeedEnabled: true }, ...override }));
      const result = spawnSync(process.execPath, ['-', path], { input: script, encoding: 'utf8',
        env: { ...process.env, URTRUCK_VERSION_NAME: '1.0.14', URTRUCK_SOURCE_SHA: sha, GITHUB_SHA: 'c'.repeat(40) } });
      assert.equal(result.status === 0, valid, result.stderr);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('все три обязательные проверки получают точный исходник сборки', () => {
  const gate = readFileSync('.github/workflows/quality-gate-reusable.yml', 'utf8');
  const checkouts = gate.split('- uses: actions/checkout@v4').slice(1);
  assert.equal(checkouts.length, 3);
  for (const section of checkouts) assert.match(section.split(/\n      - /)[0], /ref: \$\{\{ inputs.source_ref \|\| github.sha \}\}/);
  assert.match(workflow, /source_ref: \$\{\{ inputs.source_sha \|\| github.sha \}\}/);
  assert.match(workflow, /URTRUCK_SOURCE_SHA: \$\{\{ inputs.source_sha \|\| github.sha \}\}/);
});
