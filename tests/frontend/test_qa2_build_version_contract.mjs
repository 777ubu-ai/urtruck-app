import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/build-android-apk.yml', 'utf8');

test('the QA2 workflow produces an Android package that upgrades the installed 211040008 build', () => {
  const match = workflow.match(/URTRUCK_VERSION_CODE=(\d+)/);
  assert.ok(match, 'QA2 versionCode must be declared in the workflow');
  assert.ok(Number(match[1]) > 211040008, 'QA2 must be a safe upgrade, never a downgrade');
});
