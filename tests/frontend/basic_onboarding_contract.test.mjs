import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(file, 'utf8');
const backend = read('backend/api/driver_registration.py');
const gate = read('backend/api/verification_gate.py');
const registration = read('backend/api/registration.py');
const client = read('src/utils/registration.js');
const success = read('src/screens/vehicle/VehicleSetupSuccessScreen.js');
const setup = read('src/screens/vehicle/VehicleSetupCountryScreen.js');
const profile = read('src/screens/onboarding/ProfileV2Screen.js');
const trips = read('src/screens/MyTripsScreen.js');
const proDocs = read('src/navigation/AppNavigator.js');

test('basic endpoint validates personal registration without requiring a vehicle', () => {
  for (const field of ['full_name', 'birth_date']) {
    assert.match(backend, new RegExp(`['"]${field}['"]`));
  }
  const missingFields = backend.slice(backend.indexOf('def _basic_onboarding_missing'), backend.indexOf('def can_publish_driver_trip'));
  assert.doesNotMatch(missingFields, /missing\.append\(["']iin["']\)/);
  for (const field of ['vehicle_registration_country', 'truck_kind', 'body_type', 'vehicle_brand', 'vehicle_plate', 'capacity_tons', 'volume_m3']) {
    assert.doesNotMatch(missingFields, new RegExp(`['"]${field}['"]`));
  }
  assert.match(backend, /"status": "basic"/);
  assert.match(backend, /"basic_onboarding_completed": 1/);
  const endpoint = backend.slice(backend.indexOf('def complete_basic_onboarding'), backend.indexOf('@driver_reg_router.post("/submit")'));
  assert.doesNotMatch(endpoint, /update_driver[\s\S]*verification_level[\s\S]*3/);
});

test('register/me exposes basic completion and the basic app has no document-review UI gate', () => {
  assert.match(registration, /"basic_onboarding_completed": bool\(driver\.get\("basic_onboarding_completed"\)\)/);
  assert.match(gate, /basic_onboarding_required/);
  assert.match(gate, /basic_onboarding_completed/);
  assert.doesNotMatch(trips, /trips-publish-gate/);
  assert.doesNotMatch(trips, /pubGateVisible|canPublish|verState/);
  assert.doesNotMatch(trips, /regAPI\.me\(\)/);
  assert.match(trips, /const onPublishRoute = async \(\) => \{\s*const result = await vehicleAPI\.list\(\)/);
});

test('VehicleSetupSuccess completes basic onboarding before opening trip creation', () => {
  assert.match(client, /async completeBasic\(\)/);
  assert.match(client, /DRIVER_REG_BASE}\/complete-basic/);
  assert.match(success, /regAPI\.completeBasic\(\)/);
  assert.match(success, /catch \{/);
  assert.match(success, /setRole\('driver'\)/);
  assert.match(success, /screen: 'Feed'/);
  assert.match(success, /basicState === 'done' \? </);
  assert.match(success, /basic-onboarding-loads/);
  assert.match(success, /testID="vehicle-setup-success"/);
  assert.doesNotMatch(success, /<Pressable disabled=\{basicState !== 'done'\}/);
  assert.match(setup, /truck_kind: draft\.vehicle_type/);
  assert.match(setup, /vehicle_registration_country: draft\.vehicle_registration_country_code/);
});

test('driver profile continues to the required single-page vehicle setup', () => {
  assert.doesNotMatch(profile, /const completed = await regAPI\.completeBasic\(\)/);
  assert.doesNotMatch(profile, /setRole\('driver'\)/);
  assert.match(profile, /navigation\.replace\('VehicleSetupCountry', \{[\s\S]*role: 'driver',[\s\S]*origin: 'basic_onboarding'/);
});

test('single-page vehicle save continues through compact completion and errors have retry', () => {
  assert.match(setup, /vehicleAPI\.save/);
  assert.match(setup, /regAPI\.saveDriverDraft/);
  assert.match(setup, /navigation\.replace\('VehicleSetupSuccess'/);
  assert.doesNotMatch(setup, /VehicleSetupReview/);
  assert.match(success, /testID="basic-onboarding-retry"/);
  assert.match(success, /const completionStarted = useRef\(false\)/);
  assert.match(success, /returnsToExistingFlow \|\| completionStarted\.current/);
  assert.match(success, /basicState !== 'done'/);
  assert.match(success, /navigation\.reset\(/);
});

test('basic profile leaves company and messenger optional', () => {
  assert.doesNotMatch(profile, /validCompany/);
  assert.match(profile, /const validMessenger = !messengerType/);
});

test('Pro documents remain separate stack routes', () => {
  for (const route of ['Citizenship', 'Identity', 'TruckParams', 'VehicleDocs', 'Security']) {
    assert.match(proDocs, new RegExp(`name="${route}"`));
  }
  assert.match(proDocs, /name="Profile"/);
});
