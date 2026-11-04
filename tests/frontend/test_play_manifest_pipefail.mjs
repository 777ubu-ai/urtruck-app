import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/deploy-play.yml', import.meta.url), 'utf8');
const block = workflow.split('      - name: Verify built AAB identity and versionCode\n')[1]
  ?.split('\n      - name:')[0];
assert.ok(block, 'Шаг проверки AAB должен существовать');
const identityChecks = block.split('\n').filter((line) => /grep\s+-[A-Za-z]*q\b/.test(line)
  && line.includes('manifest_xml')).map((line) => line.trim());
assert.equal(identityChecks.length, 3, 'Package, versionCode и versionName проверяются отдельно');
const alignmentCheck = block.match(/if ![^\n]*PAGE_ALIGNMENT_16K[^\n]*\n[\s\S]*?\n\s*fi/)?.[0];
assert.ok(alignmentCheck, 'Проверка alignment обязательна');

function run(script, input) {
  return spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
    input,
    encoding: 'utf8',
    env: { ...process.env, URTRUCK_VERSION_CODE: '215771496', URTRUCK_VERSION_NAME: '1.0.14' },
    maxBuffer: 4 * 1024 * 1024,
  });
}

function manifest({ packageName = 'com.urtruck.app', code = '215771496', version = '1.0.14' } = {}) {
  return `<manifest package="${packageName}" android:versionCode="${code}" android:versionName="${version}">\n`
    + `<!-- ${'x'.repeat(1024 * 1024)} -->\n</manifest>\n`;
}

test('Большой корректный manifest проходит с pipefail без SIGPIPE', () => {
  const result = run(`manifest_xml=$(cat)\n${identityChecks.join('\n')}`, manifest());
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, change] of [
  ['package', { packageName: 'com.urtruck.app.qa2' }],
  ['versionCode', { code: '215771495' }],
  ['versionName', { version: '1.0.13' }],
]) {
  test(`Неверный ${name} по-прежнему блокирует AAB`, () => {
    const result = run(`manifest_xml=$(cat)\n${identityChecks.join('\n')}`, manifest(change));
    assert.notEqual(result.status, 0);
  });
}

test('Большой config с PAGE_ALIGNMENT_16K проходит с pipefail', () => {
  const result = run(`bundle_config=$(cat)\n${alignmentCheck}`, `PAGE_ALIGNMENT_16K\n${'x'.repeat(1024 * 1024)}`);
  assert.equal(result.status, 0, result.stderr);
});

test('Отсутствие PAGE_ALIGNMENT_16K по-прежнему блокирует AAB', () => {
  const result = run(`bundle_config=$(cat)\n${alignmentCheck}`, 'PAGE_ALIGNMENT_4K\n');
  assert.notEqual(result.status, 0);
});
