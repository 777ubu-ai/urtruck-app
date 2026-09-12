import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const country = read('src/screens/vehicle/VehicleSetupCountryScreen.js');
const machine = read('src/screens/vehicle/VehicleSetupMachineScreen.js');
const review = read('src/screens/vehicle/VehicleSetupReviewScreen.js');
const success = read('src/screens/vehicle/VehicleSetupSuccessScreen.js');
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
});

test('machine selectors persist dependent values atomically', () => {
  assert.match(machine, /onSelect=\{\(v\) => setValues\(\{ vehicle_type: v, body_type: '' \}\)\}/);
  assert.doesNotMatch(machine, /setValue\('vehicle_type', v\); setValue\('body_type', ''\)/);
});
