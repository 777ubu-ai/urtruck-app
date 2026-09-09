import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const primitive = readFileSync('src/components/ui/v1/KeyboardSafeLayout.js', 'utf8');
const screen = readFileSync('src/components/ui/v1/Screen.js', 'utf8');
const identity = readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
const bid = readFileSync('src/components/BidModal.js', 'utf8');
const createCargo = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const truckParams = readFileSync('src/screens/registration/TruckParamsScreen.js', 'utf8');
const vehicleDocs = readFileSync('src/screens/registration/VehicleDocsScreen.js', 'utf8');
const editTrip = readFileSync('src/screens/EditTripScreen.js', 'utf8');

test('canonical keyboard primitive scrolls the focused native input into view', () => {
  assert.match(primitive, /KeyboardSafeScrollView/);
  assert.match(primitive, /scrollResponderScrollNativeHandleToKeyboard/);
  assert.match(primitive, /keyboardShouldPersistTaps/);
  assert.match(primitive, /keyboardVerticalOffset=\{offset\}/);
});

test('active long forms use the canonical keyboard-aware scroll container', () => {
  assert.match(screen, /KeyboardSafeScrollView/);
  assert.match(identity, /KeyboardSafeScrollView/);
  assert.match(bid, /KeyboardSafeScrollView/);
  assert.match(createCargo, /<Screen[\s\S]*contentStyle/);
  assert.match(truckParams, /KeyboardSafeLayout[\s\S]*KeyboardSafeScrollView/);
  assert.match(vehicleDocs, /KeyboardSafeLayout[\s\S]*KeyboardSafeScrollView/);
  assert.match(editTrip, /KeyboardSafeLayout[\s\S]*KeyboardSafeScrollView/);
});

test('Android uses resize mode without a fixed keyboard offset', () => {
  const app = readFileSync('app.json', 'utf8');
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(app, /"softwareKeyboardLayoutMode"\s*:\s*"resize"/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.doesNotMatch(primitive, /paddingBottom:\s*\d{3,}/);
});
