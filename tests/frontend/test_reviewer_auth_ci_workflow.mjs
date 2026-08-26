import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/reviewer-auth-ci-diagnostic.yml'),
  'utf8',
);

test('reviewer auth ci workflow downloads the exact APK artifact and verifies its SHA256', () => {
  assert.match(workflow, /SOURCE_SHA: aaf8760da0fa4b8068db27a2d535aff938e593dc/);
  assert.match(workflow, /APK_RUN_ID: "32864148744"/);
  assert.match(workflow, /APK_ARTIFACT_ID: "9569835383"/);
  assert.match(workflow, /APK_SHA256: 062842f31ec74f5b6cdb9cd841f5abe541d0d844de55315c61960a27812cad7b/);
  assert.match(workflow, /actions\/artifacts\/\$\{APK_ARTIFACT_ID\}\/zip/);
  assert.match(workflow, /test -f "\$APK_DIR\/UrTruck\.apk"/);
  assert.match(workflow, /test "\$actual" = "\$APK_SHA256"/);
});

test('reviewer auth ci workflow captures exact checkpoint screenshots, UI XML and transport evidence', () => {
  for (const file of [
    'before_tap.png',
    'after_tap_500ms.png',
    'after_tap_3s.png',
    'before_tap.xml',
    'after_tap_500ms.xml',
    'after_tap_3s.xml',
    'logcat.txt',
    'maestro-stdout.txt',
    'maestro-stderr.txt',
    'adb-devices-before.txt',
    'adb-devices-after.txt',
  ]) {
    assert.match(workflow, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workflow, /uiautomator dump/);
  assert.match(workflow, /adb exec-out screencap -p/);
  assert.match(workflow, /adb logcat -v time/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if: always\(\)/);
});

test('reviewer auth ci workflow classifies only pass, harness, product or integration', () => {
  assert.match(workflow, /echo "HARNESS" > "\$ARTIFACT_DIR\/classification\.txt"/);
  assert.match(workflow, /echo "PASS" > "\$ARTIFACT_DIR\/classification\.txt"/);
  assert.match(workflow, /echo "INTEGRATION" > "\$ARTIFACT_DIR\/classification\.txt"/);
  assert.match(workflow, /echo "PRODUCT" > "\$ARTIFACT_DIR\/classification\.txt"/);
  assert.match(workflow, /maestro test "\$SOURCE_DIR\/qa\/maestro\/google-play-location\/login-reviewer-driver\.yaml"/);
});
