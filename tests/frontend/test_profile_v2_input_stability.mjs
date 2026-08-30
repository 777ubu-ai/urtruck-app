import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');

test('ProfileV2 text inputs are not remounted on every typed character', () => {
  const fieldIndex = profile.indexOf('function ProfileField');
  const screenIndex = profile.indexOf('export default function ProfileV2Screen');

  assert.ok(fieldIndex >= 0, 'ProfileField must be a real component');
  assert.ok(screenIndex >= 0, 'ProfileV2Screen must exist');
  assert.ok(
    fieldIndex < screenIndex,
    'ProfileField must live outside ProfileV2Screen so TextInput keeps focus while state updates',
  );
  assert.doesNotMatch(
    profile.slice(screenIndex, screenIndex + 7000),
    /const Field = \(/,
    'do not declare the input field component inside ProfileV2Screen',
  );
});

test('ProfileV2 keeps iOS contact autofill away from name and company fields', () => {
  assert.match(profile, /textContentType=\{id === 'phone' \? 'telephoneNumber' : 'none'\}/);
  assert.match(profile, /autoComplete=\{id === 'phone' \? 'tel' : 'off'\}/);
  assert.match(profile, /autoCorrect=\{false\}/);
});
