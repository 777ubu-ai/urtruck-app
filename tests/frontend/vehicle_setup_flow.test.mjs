import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const country = read('src/screens/vehicle/VehicleSetupCountryScreen.js');
const machine = read('src/screens/vehicle/VehicleSetupMachineScreen.js');
const review = read('src/screens/vehicle/VehicleSetupReviewScreen.js');
const success = read('src/screens/vehicle/VehicleSetupSuccessScreen.js');
const chooser = read('src/screens/vehicle/VehicleChooserScreen.js');
const profile = read('src/screens/ProfileScreen.js');
const api = read('src/utils/vehicleAPI.js');

test('vehicle setup is a four-step flow with independent country fields', () => {
  assert.match(country, /step=\{1\}/);
  assert.match(machine, /step=\{2\}/);
  assert.match(review, /step=\{3\}/);
  assert.match(success, /step=\{4\}/);
  assert.match(country, /driver_citizenship_country_code/);
  assert.match(country, /vehicle_registration_country_code/);
  assert.doesNotMatch(country, /KZ.*default|default.*KZ/);
});

test('vehicle setup keeps machine separate and reuses it for publishing', () => {
  assert.match(review, /vehicleAPI\.save/);
  assert.match(api, /driver\/vehicles/);
  assert.match(read('backend/database/vehicles_schema.sql'), /CREATE TABLE IF NOT EXISTS vehicles/);
  assert.match(read('src/screens/MyTripsScreen.js'), /vehicles\.length === 0/);
  assert.match(read('src/screens/CreateTripScreen.js'), /vehicle_id/);
});

test('machine form has dependent body options and numeric validation', () => {
  assert.match(machine, /BODIES/);
  assert.match(machine, /decimal-pad/);
  assert.match(machine, /Number\(draft\.payload_tons\) <= 0/);
  assert.match(machine, /draft\.make === 'Other'/);
  assert.match(machine, /search hideIcons/);
});

test('country setup renders the selected ISO as the shared round flag', () => {
  assert.match(country, /countryCode=\{draft\.driver_citizenship_country_code\}/);
  assert.match(country, /countryCode=\{draft\.vehicle_registration_country_code\}/);
});

test('lost auth never exposes no_token and returns vehicle setup to sign-in safely', () => {
  const registration = read('src/utils/registration.js');
  assert.match(registration, /function authRequiredResult\(\)/);
  assert.match(registration, /detail:\s*tGlobal\('session_expired'\)/);
  assert.doesNotMatch(registration, /detail:\s*'no_token'/);
  assert.match(country, /if \(saved\.authRequired\)/);
  assert.match(country, /Alert\.alert/);
  assert.match(country, /onPress:\s*\(\) => signOut\(\)/);
  assert.match(country, /storage\.set\(KEY, JSON\.stringify\(next\)\)/);
});

test('Border and Profile vehicle management return to their originating screen', () => {
  assert.match(profile, /testID: 'profile-my-vehicles'/);
  assert.match(profile, /screen: 'VehicleChooser', params: \{ origin: 'Profile' \}/);
  assert.match(chooser, /storage\.remove\(DRAFT_KEY\)/);
  assert.match(chooser, /storage\.set\(DRAFT_KEY, JSON\.stringify\(item\)\)/);
  assert.match(chooser, /vehicleId: item\.id/);
  assert.match(review, /vehicleAPI\.save\(payload, route\?\.params\?\.vehicleId\)/);
  assert.match(review, /origin === 'Border' \|\| route\?\.params\?\.origin === 'Profile'/);
  assert.match(success, /origin === 'Border'/);
  assert.match(success, /screen: 'Queue'/);
  assert.match(success, /origin === 'Profile'/);
  assert.match(success, /testID=\{origin === 'Border' \? 'border-vehicle-return'/);
});

test('machine selectors persist dependent values atomically', () => {
  assert.match(machine, /onSelect=\{\((?:v|value)\) => setValues\(\{ vehicle_type: (?:v|value), body_type: '' \}\)\}/);
  assert.doesNotMatch(machine, /setValue\('vehicle_type', v\); setValue\('body_type', ''\)/);
});
