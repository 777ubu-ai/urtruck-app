import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function block(file, name) {
  const text = readFileSync(file, 'utf8').split(`- name: ${name}\n`)[1];
  assert.ok(text, name);
  const run = text.split('        run: |\n')[1].split('\n      - name:')[0];
  return run.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
function execute(script, environment) {
  const root = mkdtempSync(join(tmpdir(), 'urtruck-counters-'));
  try {
    mkdirSync(join(root, 'bin'));
    for (const [name, body] of Object.entries({ npx: 'printf \'%s\\n\' "$FAKE_EAS_JSON"', date: 'printf \'%s\\n\' "$FAKE_EPOCH"' })) {
      const path = join(root, 'bin', name); writeFileSync(path, '#!/bin/sh\n' + body + '\n'); chmodSync(path, 0o755);
    }
    const output = join(root, 'environment');
    const result = spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', env: {
      ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH,
      RUNNER_TEMP: root, GITHUB_ENV: output, GITHUB_REF_NAME: 'fix/owned-telegram-feed-share-20261025', ...environment,
    } });
    return { status: result.status, output: result.status === 0 ? readFileSync(output, 'utf8') : '', stderr: result.stderr };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const ios = block('.github/workflows/testflight-rc.yml', 'Read remote iOS build counter before incrementing');
for (const [remote, floor, ok] of [['111', '111', true], ['115', '112', true], ['110', '111', false], ['', '111', false], ['bad', '111', false]]) {
  test(`iOS EAS ${remote || 'missing'} / ASC ${floor}: ${ok ? 'PASS' : 'отказ до сборки'}`, () => {
    const result = execute(ios, { FAKE_EAS_JSON: JSON.stringify({ buildNumber: remote }), URTRUCK_MIN_IOS_BUILD: floor });
    assert.equal(result.status === 0, ok, result.stderr);
    if (ok) assert.equal(result.output, `URTRUCK_EAS_IOS_BUILD_BEFORE=${remote}\n`);
  });
}
const android = block('.github/workflows/deploy-play.yml', 'Compute collision-resistant versionCode');
for (const [maximum, expected] of [['215024884', 220000000], ['230000000', 230000001], ['abc', null], ['215024883', null], ['2100000000', null]]) {
  test(`Android verified max ${maximum}: ${expected ?? 'отказ до сборки'}`, () => {
    const result = execute(android, { VERIFIED_PLAY_MAX_CODE: maximum, FAKE_EPOCH: String(1577836800 + 220000000) });
    assert.equal(result.status === 0, expected !== null, result.stderr);
    if (expected !== null) assert.equal(result.output, `URTRUCK_VERSION_CODE=${expected}\n`);
  });
}
