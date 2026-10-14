import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const setup = read('src/screens/vehicle/VehicleSetupCountryScreen.js');
const success = read('src/screens/vehicle/VehicleSetupSuccessScreen.js');
const chooser = read('src/screens/vehicle/VehicleChooserScreen.js');
const profile = read('src/screens/ProfileScreen.js');
const api = read('src/utils/vehicleAPI.js');
const copy = read('src/utils/vehicleSetupCopy.js');

test('vehicle registration is one empty form without the legacy progress flow', () => {
  assert.match(setup, /testID="vehicle-setup-single-screen"/);
  assert.match(setup, /const EMPTY_DRAFT = \{[\s\S]*driver_citizenship_country_code: ''/);
  assert.match(setup, /vehicle_registration_country_code: ''/);
  assert.match(setup, /vehicle_type: ''/);
  assert.match(setup, /make: ''/);
  assert.match(setup, /model: ''/);
  assert.doesNotMatch(setup, /ProgressHeader/);
  assert.doesNotMatch(setup, /machineSub|basicsSub/);
  assert.doesNotMatch(setup, /navigation\.navigate\('VehicleSetupMachine'/);
  assert.doesNotMatch(setup, /navigation\.navigate\('VehicleSetupReview'/);
});

test('new vehicle forms clear stale defaults while edit and recovery restore the draft', () => {
  assert.match(setup, /const shouldRestore = Boolean\(route\?\.params\?\.vehicleId \|\| route\?\.params\?\.preserveDraft\)/);
  assert.match(setup, /if \(!shouldRestore\) await storage\.remove\(KEY\)/);
  assert.match(setup, /setDraft\(\{ \.\.\.EMPTY_DRAFT, \.\.\.local \}\)/);
  assert.doesNotMatch(setup, /driver_citizenship_country_code: 'KZ'/);
  assert.doesNotMatch(setup, /vehicle_registration_country_code: 'KZ'/);
});

test('single form contains every required vehicle field', () => {
  for (const testID of [
    'vehicle-citizenship-selector',
    'vehicle-registration-selector',
    'vehicle-type-selector',
    'vehicle-body-selector',
    'vehicle-make-selector',
    'vehicle-model-selector',
    'vehicle-license-plate',
    'vehicle-payload',
    'vehicle-volume',
  ]) {
    assert.match(setup, new RegExp(testID));
  }
  assert.match(setup, /const required = \[[\s\S]*'cargo_volume_m3'/);
  assert.match(setup, /disabled=\{incomplete \|\| saving\}/);
  assert.match(setup, /testID="vehicle-save"/);
  assert.match(setup, /<Label>\{c\.citizenship\}<\/Label>/);
  assert.match(setup, /<Label>\{c\.registrationShort \|\| c\.registration\}<\/Label>/);
  assert.match(copy, /saveVehicle: 'Сохранить машину'/);
});

test('dependent selectors, numeric validation, and localized body names remain intact', () => {
  assert.match(setup, /BODIES/);
  assert.match(setup, /decimal-pad/);
  assert.match(setup, /Number\(draft\.payload_tons\) > 0/);
  assert.match(setup, /draft\.make === 'Other'/);
  assert.match(setup, /search hideIcons/);
  assert.match(copy, /curtain_sider: 'Тент'/);
});

test('vehicle is saved before the compact success page', () => {
  assert.match(setup, /vehicleAPI\.save\(payload, route\?\.params\?\.vehicleId\)/);
  assert.match(setup, /regAPI\.saveDriverDraft/);
  assert.match(setup, /navigation\.replace\('VehicleSetupSuccess'/);
  assert.match(api, /driver\/vehicles/);
  assert.match(success, /registrationComplete/);
  assert.match(success, /goToLoads/);
  assert.match(success, /basic-onboarding-loads/);
  assert.doesNotMatch(success, /benefits|successSub|slogan|publishRoutes/);
  assert.doesNotMatch(success, /ProgressHeader/);
});

test('Border and Profile vehicle management return to their originating screen', () => {
  assert.match(profile, /testID: 'profile-my-vehicles'/);
  assert.match(profile, /screen: 'VehicleChooser', params: \{ origin: 'Profile' \}/);
  assert.match(chooser, /storage\.remove\(DRAFT_KEY\)/);
  assert.match(chooser, /storage\.set\(DRAFT_KEY, JSON\.stringify\(item\)\)/);
  assert.match(chooser, /vehicleId: item\.id/);
  assert.match(chooser, /vehicleAPI\.remove\(pendingDelete\.id\)/);
  assert.match(chooser, /testID="vehicle-delete-confirm"/);
  assert.match(api, /remove: \(vehicleId\).*method: 'DELETE'/);
  assert.match(copy, /deleteVehicle: 'Удалить машину'/);
  assert.match(success, /origin === 'Border'/);
  assert.match(success, /screen: 'Queue'/);
  assert.match(success, /origin === 'Profile'/);
  assert.match(success, /profile-vehicle-return/);
});

test('completion failure keeps the entered form recoverable', () => {
  assert.match(success, /BASIC_ONBOARDING_INCOMPLETE/);
  assert.match(success, /ROLE_ALREADY_SET/);
  assert.match(success, /basic-onboarding-fix-data/);
  assert.match(success, /basic-onboarding-retry/);
  assert.match(success, /preserveDraft: true/);
  assert.match(copy, /finishErrorTitle/);
});
