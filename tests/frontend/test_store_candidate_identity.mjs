import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const source = 'a'.repeat(40);
const paths = ['app.json', 'ios/UrTruck/Info.plist', 'ios/UrTruck.xcodeproj/project.pbxproj', 'android/app/build.gradle'];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'urtruck-store-identity-'));
  for (const path of paths) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), readFileSync(path)); }
  return root;
}
function run(root, platform, version = '1.0.12', sha = source) {
  return spawnSync('python3', ['scripts/prepare_store_candidate_version.py', '--root', root, '--platform', platform, '--version', version, '--source-sha', sha], { encoding: 'utf8' });
}
for (const platform of ['ios', 'android']) test(`${platform}: настоящий native/config меняет только версию и публичную identity`, () => {
  const root = fixture();
  try {
    const result = run(root, platform); assert.equal(result.status, 0, result.stderr);
    const before = JSON.parse(readFileSync('app.json'));
    const after = JSON.parse(readFileSync(join(root, 'app.json')));
    assert.equal(after.expo.version, '1.0.12');
    assert.equal(after.expo.extra.urtruckSourceSha, source);
    assert.equal(after.expo.extra.urtruckExternalFreightFeedEnabled, true);
    after.expo.version = before.expo.version;
    for (const key of ['urtruckSourceSha', 'urtruckExternalFreightFeedEnabled']) {
      if (before.expo.extra?.[key] === undefined) delete after.expo.extra[key]; else after.expo.extra[key] = before.expo.extra[key];
    }
    if (!before.expo.extra) delete after.expo.extra;
    assert.deepEqual(after, before, 'включая permissions, плагины, API и native metadata');
    for (const path of paths.slice(1)) {
      const actual = readFileSync(join(root, path), 'utf8');
      const baseline = readFileSync(path, 'utf8');
      const applies = platform === 'ios' ? path.startsWith('ios/') : path.startsWith('android/');
      let expected = baseline;
      if (applies && path.endsWith('project.pbxproj')) expected = baseline.replaceAll('MARKETING_VERSION = 1.0.9;', 'MARKETING_VERSION = 1.0.12;');
      else if (applies && path.endsWith('Info.plist')) expected = baseline.replace('<string>1.0.9</string>', '<string>1.0.12</string>');
      else if (applies) expected = baseline.replace('versionName \"1.0.9\"', 'versionName \"1.0.12\"');
      assert.equal(actual, expected, 'native пути и прочие настройки неизменны');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('неверная структура/identity отказывает до любых записей', () => {
  const root = fixture();
  try {
    const snapshots = new Map(paths.map(p => [p, readFileSync(join(root, p), 'utf8')]));
    assert.notEqual(run(root, 'ios', '1.0.12;echo bad').status, 0);
    assert.notEqual(run(root, 'android', '1.0.12', 'wrong-sha').status, 0);
    for (const [p, value] of snapshots) assert.equal(readFileSync(join(root, p), 'utf8'), value);
    const p = join(root, 'ios/UrTruck.xcodeproj/project.pbxproj');
    writeFileSync(p, readFileSync(p, 'utf8').replaceAll('MARKETING_VERSION', 'UNKNOWN_VERSION'));
    const before = readFileSync(join(root, 'app.json'), 'utf8');
    assert.notEqual(run(root, 'ios').status, 0);
    assert.equal(readFileSync(join(root, 'app.json'), 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
