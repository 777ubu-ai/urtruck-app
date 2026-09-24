import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

test('vehicle chooser has explicit Back in loading and loaded states', () => {
  const src = read('src/screens/vehicle/VehicleChooserScreen.js');
  assert.match(src, /BackButton/);
  assert.match(src, /testID="vehicle-chooser-back"/);
  assert.match(src, /navigation\.goBack\(\)/);
  assert.match(src, /if \(!vehicles\)[\s\S]*\{header\}/);
  assert.match(src, /return <SafeAreaView[\s\S]*\{header\}/);
});

test('premium registration profile cannot trap the user without Back', () => {
  const src = read('src/screens/registration/PremiumProfileScreen.js');
  assert.match(src, /BackButton/);
  assert.match(src, /testID="prem-reg-profile-back"/);
  assert.match(src, /navigation\.goBack\(\)/);
});

test('single-page vehicle registration keeps explicit Back and local country search', () => {
  const screen = read('src/screens/vehicle/VehicleSetupCountryScreen.js');
  const ui = read('src/components/vehicle/VehicleSetupUI.js');
  assert.match(screen, /BackButton onPress=\{\(\) => navigation\.goBack\(\)\}/);
  assert.doesNotMatch(screen, /ProgressHeader/);
  assert.match(ui, /searchAllCountries\(query, lang\)/);
});
