import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const androidHost = readFileSync('src/screens/DealWorkspaceScreenV2.android.js', 'utf8');
const canonicalRoute = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));

test('Android deal chat uses a height-based keyboard host', () => {
  assert.match(androidHost, /KeyboardAvoidingView/);
  assert.match(androidHost, /behavior="height"/);
  assert.match(androidHost, /keyboardVerticalOffset=\{0\}/);
  assert.match(androidHost, /testID="deal-workspace-android-keyboard-host"/);
  assert.match(androidHost, /DealWorkspaceScreenV2\.js/);
});

test('canonical route stays extensionless so Metro selects the Android host', () => {
  assert.match(canonicalRoute, /from '\.\.\/\.\.\/screens\/DealWorkspaceScreenV2'/);
  assert.doesNotMatch(canonicalRoute, /DealWorkspaceScreenV2\.js/);
});

test('native Android remains configured for resize as the first line of defense', () => {
  assert.equal(appJson?.expo?.android?.softwareKeyboardLayoutMode, 'resize');
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
});
