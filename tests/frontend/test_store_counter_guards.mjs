import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function block(file, name) {
  const text = readFileSync(file, 'utf8').split(`- name: ${name}\n`)[1];
  assert.ok(text, name);
  const run = text.split('        run: |\n')[1].split('\n      - name:')[0];
  return run.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
function execute(script, environment, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'urtruck-counters-'));
  try {
    mkdirSync(join(root, 'bin'));
    for (const [name, value] of Object.entries(files)) writeFileSync(join(root, name), JSON.stringify(value));
    for (const [name, body] of Object.entries({ npx: 'printf \'%s\\n\' "$FAKE_EAS_JSON"', date: 'printf \'%s\\n\' "$FAKE_EPOCH"' })) {
      const path = join(root, 'bin', name); writeFileSync(path, '#!/bin/sh\n' + body + '\n'); chmodSync(path, 0o755);
    }
    const output = join(root, 'environment');
    const result = spawnSync('/bin/bash', ['-c', script], { cwd: root, encoding: 'utf8', env: {
      ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH,
      RUNNER_TEMP: root, GITHUB_ENV: output, GITHUB_REF_NAME: 'qa2/integration-candidate', ...environment,
    } });
    return { status: result.status, output: result.status === 0 && existsSync(output) ? readFileSync(output, 'utf8') : '', stderr: result.stderr };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const ios = block('.github/workflows/testflight-rc.yml', 'Verify version-local iOS counter without changing remote state');
for (const [source, autoIncrement, configured, requested, ok] of [
  ['local', false, '1', '1', true], ['local', false, '100', '100', true],
  ['remote', false, '1', '1', false], ['local', true, '1', '1', false],
  ['local', false, '2', '1', false], ['local', false, undefined, '1', false],
]) {
  test(`iOS серия: ${source}, autoIncrement=${autoIncrement}, ${configured}/${requested}: ${ok ? 'PASS' : 'отказ до сборки'}`, () => {
    const result = execute(ios, { URTRUCK_IOS_BUILD_NUMBER: requested }, {
      'eas.json': { cli: { appVersionSource: source }, build: { production: { ios: { autoIncrement } } } },
      'app.json': { expo: { ios: { buildNumber: configured } } },
    });
    assert.equal(result.status === 0, ok, result.stderr);
    if (ok) assert.equal(result.output, '', 'remote counter не перезаписывается');
  });
}
const android = block('.github/workflows/deploy-play.yml', 'Compute collision-resistant versionCode');
for (const [maximum, expected] of [['215024884', 215024885], ['230000000', 230000001], ['abc', null], ['215024883', null], ['2100000000', null]]) {
  test(`Android verified max ${maximum}: ${expected ?? 'отказ до сборки'}`, () => {
    const result = execute(android, { VERIFIED_PLAY_MAX_CODE: maximum, FAKE_EPOCH: String(1577836800 + 220000000) });
    assert.equal(result.status === 0, expected !== null, result.stderr);
    if (expected !== null) assert.equal(result.output, `URTRUCK_VERSION_CODE=${expected}\n`);
  });
}

const playCandidate = block('.github/workflows/deploy-play.yml', 'Prepare reviewed internal candidate identity');
test('Play rejects QA2 candidate runs from refs other than the reviewed integration branch', () => {
  const result = execute(playCandidate, { API_ENVIRONMENT_INPUT: 'qa2', GITHUB_REF_NAME: 'main' });
  assert.notEqual(result.status, 0);
});
