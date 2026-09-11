import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(file, 'utf8');
const backend = read('backend/api/driver_registration.py');
const gate = read('backend/api/verification_gate.py');
const registration = read('backend/api/registration.py');
const client = read('src/utils/registration.js');
const success = read('src/screens/vehicle/VehicleSetupSuccessScreen.js');
const review = read('src/screens/vehicle/VehicleSetupReviewScreen.js');
const profile = read('src/screens/onboarding/ProfileV2Screen.js');
const trips = read('src/screens/MyTripsScreen.js');
const proDocs = read('src/navigation/AppNavigator.js');

test('basic endpoint validates the complete minimum profile and sets only basic status', () => {
  for (const field of ['citizenship_country', 'full_name', 'birth_date', 'vehicle_registration_country', 'truck_kind', 'body_type', 'vehicle_brand', 'vehicle_plate', 'capacity_tons', 'volume_m3']) {
    assert.match(backend, new RegExp(`['"]${field}['"]`));
  }
  assert.match(backend, /re\.fullmatch\(r?["']\\d\{12\}["']/);
  assert.match(backend, /"status": "basic"/);
  assert.match(backend, /"basic_onboarding_completed": 1/);
  const endpoint = backend.slice(backend.indexOf('def complete_basic_onboarding'), backend.indexOf('@driver_reg_router.post("/submit")'));
  assert.doesNotMatch(endpoint, /update_driver[\s\S]*verification_level[\s\S]*3/);
});

test('register/me exposes the basic completion flag and trip gate is explicit', () => {
  assert.match(registration, /"basic_onboarding_completed": bool\(driver\.get\("basic_onboarding_completed"\)\)/);
  assert.match(gate, /basic_onboarding_required/);
  assert.match(gate, /basic_onboarding_completed/);
  assert.match(trips, /me\.basic_onboarding_completed/);
  assert.match(trips, /if \(!canPublish\)/);
});

test('VehicleSetupSuccess completes basic onboarding before opening trip creation', () => {
  assert.match(client, /async completeBasic\(\)/);
  assert.match(client, /DRIVER_REG_BASE}\/complete-basic/);
  assert.match(success, /regAPI\.completeBasic\(\)/);
  assert.match(success, /setRole\('driver'\)/);
  assert.match(success, /navigation\.replace\('CreateTrip'/);
  assert.match(review, /truck_kind: d\.vehicle_type/);
  assert.match(review, /vehicle_registration_country: d\.vehicle_registration_country_code/);
});

test('driver profile continues to vehicle setup and does not commit driver role early', () => {
  assert.match(profile, /navigation\.replace\('VehicleSetupCountry', \{ role: 'driver', origin: 'basic_onboarding' \}\)/);
  const driverContinue = profile.slice(profile.indexOf("if (role === 'driver') {\n        navigation.replace('VehicleSetupCountry'"), profile.indexOf('setRole(role)'));
  assert.doesNotMatch(driverContinue, /setRole\(/);
  assert.doesNotMatch(driverContinue, /Main/);
});

test('vehicle save without publication still completes basic onboarding and errors have retry', () => {
  assert.match(review, /if \(!publish\) \{ const completed = await regAPI\.completeBasic\(\)/);
  assert.match(review, /setRole\('driver'\)/);
  assert.match(review, /testID="vehicle-setup-retry"/);
  assert.doesNotMatch(review, /c\.documents/);
  assert.match(success, /testID="basic-onboarding-retry"/);
  assert.match(success, /const completionStarted = useRef\(false\)/);
  assert.match(success, /if \(completionStarted\.current\) return undefined/);
  assert.match(success, /basicState !== 'done'/);
  assert.match(success, /navigation\.replace\('Main', \{ role: 'driver' \}\)/);
});

test('driver basic profile leaves company and messenger optional', () => {
  assert.match(profile, /const validCompany = role === 'driver' \|\| company\.trim\(\)\.length >= 2/);
  assert.match(profile, /const validMessenger = role === 'driver' \|\| !messengerType/);
});

test('Pro documents remain separate stack routes', () => {
  for (const route of ['Citizenship', 'Identity', 'TruckParams', 'VehicleDocs', 'Security']) {
    assert.match(proDocs, new RegExp(`name="${route}"`));
  }
  assert.match(proDocs, /name="Profile"/);
});
