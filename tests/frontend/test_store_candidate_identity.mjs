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
function run(root, platform, version = '1.0.12', sha = source, buildNumber) {
  return spawnSync('python3', ['scripts/prepare_store_candidate_version.py', '--root', root, '--platform', platform, '--version', version, '--source-sha', sha,
    ...(buildNumber === undefined ? [] : ['--build-number', buildNumber])], { encoding: 'utf8' });
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
for (const input of ['001', '1', '2', '100']) test(`iOS: серия 1.0.15(${input}) согласована во всех native/config файлах`, () => {
  const root = fixture();
  try {
    const result = run(root, 'ios', '1.0.15', source, input);
    assert.equal(result.status, 0, result.stderr);
    const expected = String(Number(input));
    assert.equal(JSON.parse(readFileSync(join(root, 'app.json'))).expo.ios.buildNumber, expected);
    const plist = readFileSync(join(root, 'ios/UrTruck/Info.plist'), 'utf8');
    assert.match(plist, new RegExp(`<key>CFBundleVersion</key>\\s*<string>${expected}</string>`));
    const project = readFileSync(join(root, 'ios/UrTruck.xcodeproj/project.pbxproj'), 'utf8');
    assert.equal((project.match(new RegExp(`CURRENT_PROJECT_VERSION = ${expected};`, 'g')) || []).length, 2);
    assert.equal(readFileSync(join(root, 'android/app/build.gradle'), 'utf8'), readFileSync('android/app/build.gradle', 'utf8'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('неверный номер или структура build не оставляют частичных изменений', () => {
  const root = fixture();
  try {
    const snapshots = new Map(paths.map(p => [p, readFileSync(join(root, p), 'utf8')]));
    for (const input of ['0', '-1', '1;exit 0', 'abc']) {
      assert.notEqual(run(root, 'ios', '1.0.15', source, input).status, 0);
      for (const [p, value] of snapshots) assert.equal(readFileSync(join(root, p), 'utf8'), value);
    }
    assert.notEqual(run(root, 'android', '1.0.15', source, '1').status, 0);
    const project = join(root, 'ios/UrTruck.xcodeproj/project.pbxproj');
    writeFileSync(project, readFileSync(project, 'utf8').replaceAll('CURRENT_PROJECT_VERSION', 'UNKNOWN_BUILD'));
    const appBefore = readFileSync(join(root, 'app.json'), 'utf8');
    assert.notEqual(run(root, 'ios', '1.0.15', source, '1').status, 0);
    assert.equal(readFileSync(join(root, 'app.json'), 'utf8'), appBefore);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('настоящие runner-шаги используют локальную серию и отвергают remote increment', () => {
  const root = fixture();
  const baselineEas = readFileSync('eas.json', 'utf8');
  const workflow = readFileSync('.github/workflows/testflight-rc.yml', 'utf8');
  const step = name => workflow.split(`- name: ${name}\n`)[1].split('        run: |\n')[1]
    .split(/\n      - (?:name:|uses:)/)[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const env = { ...process.env, URTRUCK_BUILD_FLAVOR: 'qa2', URTRUCK_VERSION_NAME: '1.0.15',
    QA_SOURCE_SHA: source, QA2_API_URL: 'https://qa2.urtruck.kz', URTRUCK_IOS_BUILD_NUMBER: '1',
    EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY: 'fixture', EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY: 'fixture' };
  const execute = name => spawnSync('/bin/bash', ['-c', step(name)], { cwd: root, env, encoding: 'utf8' });
  try {
    assert.equal(run(root, 'ios', '1.0.15', source, '001').status, 0);
    writeFileSync(join(root, 'eas.json'), baselineEas);
    assert.equal(execute('Inject QA2 runtime configuration').status, 0);
    const verify = 'Verify version-local iOS counter without changing remote state';
    assert.equal(execute(verify).status, 0);
    const localEas = JSON.parse(readFileSync(join(root, 'eas.json')));
    assert.equal(localEas.cli.appVersionSource, 'local');
    assert.equal(localEas.build.production.ios.autoIncrement, false);
    for (const change of [eas => { eas.cli.appVersionSource = 'remote'; },
      eas => { eas.build.production.ios.autoIncrement = true; }]) {
      const changed = structuredClone(localEas); change(changed);
      writeFileSync(join(root, 'eas.json'), JSON.stringify(changed));
      assert.notEqual(execute(verify).status, 0);
    }
    assert.equal(readFileSync('eas.json', 'utf8'), baselineEas, 'исходная production-конфигурация не изменена');
    assert.doesNotMatch(workflow, /build:version:(set|sync)/, 'QA2 workflow не сбрасывает глобальный EAS counter');
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
