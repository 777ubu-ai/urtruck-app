import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/deal/DealRoom.js', 'utf8');

assert.match(source, /import TruckMap from '\.\.\/TruckMap'/, 'DealRoom must embed TruckMap');
assert.match(source, /parseRouteCities\(rawRoute\)/, 'DealRoom must derive planned route points from the deal route');
assert.match(source, /status === 'accepted'/, 'Accepted deals must expose the map automatically');
assert.match(source, /role === 'driver'.*DRIVER_MAP_STATUSES\.includes\(status\)/s, 'Driver must keep the route map through active trip statuses');
assert.match(source, /testID="deal-automatic-route-map"/, 'Automatic map needs a stable QA selector');
assert.match(source, /plannedTitle=\{mapCopy\.title\}/, 'Planned map must provide localized map copy');

console.log('deal room automatic map contract: PASS');
