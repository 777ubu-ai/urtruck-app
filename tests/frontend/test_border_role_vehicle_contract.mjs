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


test('Border keeps rolling-deploy fallback when /borders/context is not deployed yet', () => {
  assert.match(border, /vehicleAPI\.list\(\)/);
  assert.match(border, /marketAPI\.myDashboard\(\{ force: true \}\)/);
  assert.doesNotMatch(border, /marketAPI\.getDeal\(/, 'Border background fallback must not mark deal notifications read');
  assert.match(border, /market\/driver-profile/);
});

test('driver enables CGR watch only on the canonical backend and an active selected deal', () => {
  assert.match(border, /!canonicalContext \|\| !isDriver \|\| !contextToken \|\| !selectedDeal/);
  assert.match(border, /setCanonicalContext\(true\)/);
  assert.match(border, /fetch\(`\$\{BASE\}\/watch`/);
  assert.match(border, /response\.ok\) setWatchEnabled\(true\)/);
});

test('driver and shipper keep manual CGR lookup secondary and privacy scoped', () => {
  assert.match(border, /showManualLookup \? <View[\s\S]*testID="border-plate-search"/);
  assert.match(border, /testID="border-shipper-manual-toggle"/);
  assert.match(border, /testID="border-manual-open-own-deal"/);
  assert.match(border, /testID="border-manual-watch"/);
  assert.match(border, /RECENT_LOOKUPS_KEY/);
  assert.doesNotMatch(border, /manualLookup\?\.(?:location|gps|driver_name|chat_room_id)/);
});

test('Border calculates road GPS/ETA only from deal GPS and verified checkpoint coordinates', () => {
  assert.match(border, /testID="border-personal-cgr-status"/);
  assert.match(border, /testID="border-gps-card"/);
  assert.match(border, /testID="border-queue-timeline"/);
  assert.match(border, /routingAPI\.roadRoute/);
  assert.match(border, /\[\[originLat, originLng\], \[checkpointLat, checkpointLng\]\]/);
  assert.match(border, /roadRoute\?\.ok \? formatDistance/);
  assert.match(border, /roadRoute\?\.ok \? formatDuration/);
  assert.match(border, /R\.routeUnavailable/);
  assert.match(border, /return \(\) => controller\.abort\(\)/);
  assert.match(border, /function parseQueueWindowStart/);
  assert.match(border, /\\d\{1,2\}.*\\d\{1,2\}.*\\d\{4\}/, 'CGR DD.MM.YYYY booking windows need an explicit parser');
  assert.match(border, /new Date\(Number\(year\), Number\(month\) - 1, Number\(day\)/);
  assert.doesNotMatch(border, /62\s*км|54\s*мин|1\s*ч\s*35\s*мин/);
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
