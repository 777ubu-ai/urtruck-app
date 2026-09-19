import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const border = fs.readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');
const bid = fs.readFileSync('src/components/BidModal.js', 'utf8');
const truckParams = fs.readFileSync('src/screens/registration/TruckParamsScreen.js', 'utf8');
const legacyCgr = fs.readFileSync('src/screens/CargoRuqsatInfoScreen.js', 'utf8');

test('Border uses compact top chrome without duplicate page title/logo space', () => {
  assert.match(border, /<RootHeader compact/);
  assert.doesNotMatch(border, /\{L\.title\}<\/Text>/);
  assert.doesNotMatch(border, /\{L\.subtitle\}<\/Text>/);
});

test('Border loads canonical private vehicle/deal context with auth', () => {
  assert.match(border, /fetch\(`\$\{BASE\}\/context`/);
  assert.match(border, /Authorization: `Bearer \$\{token\}`/);
  assert.match(border, /selectedDeal\?\.plate \|\| selectedVehicle\?\.license_plate/);
  assert.match(border, /testID="border-driver-vehicle-card"/);
  assert.match(border, /testID="border-shipper-deals-card"/);
});

test('driver automatically enables CGR watch only for an active selected deal', () => {
  assert.match(border, /!isDriver \|\| !contextToken \|\| !selectedDeal/);
  assert.match(border, /fetch\(`\$\{BASE\}\/watch`/);
  assert.match(border, /method: 'POST'/);
});

test('shipper does not get the manual plate workflow; driver keeps it as secondary action', () => {
  assert.match(border, /isDriver && showManualLookup \? <View[\s\S]*testID="border-plate-search"/);
  assert.match(border, /R\.checkOther/);
  assert.match(border, /manualLookup/);
});

test('multi-vehicle cargo bid binds a concrete vehicle id', () => {
  assert.match(bid, /vehicleAPI\.list\(\)/);
  assert.match(bid, /testID="bid-vehicle-chooser"/);
  assert.match(bid, /vehicle_id: selectedVehicleId \|\| null/);
});

test('trailer plate is separated from tractor plate', () => {
  assert.match(truckParams, /trailer_plate: trailerPlate\.trim\(\)\.toUpperCase\(\)/);
  assert.doesNotMatch(truckParams, /vehicle_plate: trailerPlate/);
});

test('legacy CargoRuqsat route delegates to the canonical Border screen', () => {
  assert.match(legacyCgr, /QueueScreenLazyV2/);
  assert.doesNotMatch(legacyCgr, /fetchScoreboard/);
});
