import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(file, 'utf8');
const setup = read('src/screens/vehicle/VehicleSetupCountryScreen.js');
const success = read('src/screens/vehicle/VehicleSetupSuccessScreen.js');
const cargo = read('src/screens/CargoDetail.js');
const trips = read('src/screens/MyTripsScreen.js');
const copy = read('src/utils/vehicleSetupCopy.js');
const registration = read('src/utils/registration.js');
const backend = read('backend/api/driver_registration.py');
const marketplace = read('backend/api/marketplace.py');

test('initial onboarding can defer the vehicle and enter the load feed', () => {
  assert.match(setup, /canSkip = route\?\.params\?\.origin === 'basic_onboarding'/);
  assert.match(setup, /testID="vehicle-add-later"/);
  assert.match(setup, /regAPI\.deferVehicle\(\)/);
  assert.match(registration, /DRIVER_REG_BASE}\/defer-vehicle/);
  assert.match(backend, /status\"\] = \"vehicle_deferred\"/);
  assert.match(marketplace, /error\": \"vehicle_required\"/);
  assert.match(setup, /setRole\('driver'\)/);
  assert.match(setup, /screen: 'Feed'/);
  assert.match(copy, /addLater: 'Добавить позже'/);
});

test('the same form is mandatory when a work action needs a vehicle', () => {
  assert.match(cargo, /vehicleAPI\.list\(\)/);
  assert.match(cargo, /origin: 'Bid'/);
  assert.match(trips, /origin: 'CreateTrip'/);
  assert.ok(trips.indexOf('vehicles.length === 0') < trips.indexOf('if (!canPublish)'));
  assert.match(success, /origin === 'CreateTrip'/);
  assert.match(success, /origin === 'Bid'/);
});
