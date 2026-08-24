import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const script = fs.readFileSync(
  path.join(root, 'qa/scripts/google-play-background-location/run-ci-video.sh'),
  'utf8',
);

test('GPS evidence script resolves aapt explicitly instead of relying on PATH', () => {
  assert.match(script, /local aapt_bin="\$\{AAPT_BIN:-\}"/);
  assert.match(script, /ANDROID_SDK_ROOT:-\$\{ANDROID_HOME:-\}/);
  assert.match(script, /find "\$sdk_root\/build-tools" -type f -name aapt/);
  assert.match(script, /"\$aapt_bin" dump badging "\$APK_PATH"/);
  assert.doesNotMatch(script, /^\s*aapt dump badging "\$APK_PATH"/m);
});
