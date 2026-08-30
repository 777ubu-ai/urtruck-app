import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const screen = readFileSync("src/screens/TrackTruckScreen.js", "utf8");
const map = readFileSync("src/components/TruckMap.web.js", "utf8");
assert.match(
  screen,
  /showBadge=\{false\}/,
  "full map screen must hide duplicate map badge",
);
assert.match(
  screen,
  /lat=\{loc \? lat : undefined\}/,
  "planned route must not fake a live vehicle coordinate",
);
assert.doesNotMatch(
  screen,
  /<View style=\{\[s\.planBanner/,
  "full map screen must not show duplicate planned-route banner",
);
assert.doesNotMatch(
  screen,
  /<View style=\{\[s\.driverCard/,
  "full map screen must not duplicate counterparty card",
);
assert.match(
  map,
  /const \[status, setStatus\] = React\.useState\((["'])loading\1\)/,
  "Yandex map must expose explicit runtime readiness state",
);
assert.match(
  map,
  /setStatus\((["'])error\1\)[\s\S]*setMountAttempt\(\(n\) => n \+ 1\)/,
  "Yandex map must retry automatically after runtime failure",
);
assert.match(
  map,
  /truck-map-yandex-not-configured/,
  "missing Yandex configuration must have an explicit in-app state",
);
assert.doesNotMatch(
  map,
  /tile\.openstreetmap\.org|OpenStreetMapFallback|truck-map-osm-fallback|useFallback/,
  "another provider must never replace Yandex",
);
assert.match(map, /new api\.Map/);
assert.match(map, /api\.multiRouter\.MultiRoute/);
console.log("clean Yandex-only map screen contract: PASS");
