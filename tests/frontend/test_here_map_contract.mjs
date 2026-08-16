import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const webMap = read('src/components/TruckMap.web.js');
const nativeMap = read('src/components/TruckMap.native.js');
const routeMap = read('src/components/RouteMap.js');
const tripDetail = read('src/screens/TripDetail.js');
const envExample = read('.env.example');

const mustInclude = (source, needle, label) => {
  if (!source.includes(needle)) {
    throw new Error(`${label} missing: ${needle}`);
  }
};

mustInclude(envExample, 'EXPO_PUBLIC_HERE_API_KEY=', '.env.example');
mustInclude(webMap, 'EXPO_PUBLIC_HERE_API_KEY', 'TruckMap.web');
mustInclude(webMap, 'HERE_API_KEY.length >= 20', 'TruckMap.web');
mustInclude(webMap, 'js.api.here.com/v3/3.1/mapsjs-core.js', 'TruckMap.web');
mustInclude(webMap, 'here-map-canvas', 'TruckMap.web');
mustInclude(webMap, 'FallbackMap', 'TruckMap.web');
mustInclude(webMap, 'UrTruck HERE', 'TruckMap.web');
mustInclude(nativeMap, 'customMapStyle={URTRUCK_MAP_STYLE}', 'TruckMap.native');
mustInclude(nativeMap, 'UrTruck Map', 'TruckMap.native');
mustInclude(nativeMap, 'Feather name="truck"', 'TruckMap.native');
mustInclude(routeMap, 'shipper-route-panel', 'RouteMap');
mustInclude(routeMap, 'driver-route-panel', 'RouteMap');
mustInclude(routeMap, 'RoleRoutePanel', 'RouteMap');
mustInclude(tripDetail, "role={role === 'client' || role === 'shipper' ? 'shipper' : 'driver'}", 'TripDetail');

if (/apiKey\\s*[:=]\\s*['"][A-Za-z0-9_-]{16,}/.test(webMap)) {
  throw new Error('TruckMap.web must not hardcode HERE API keys');
}

if (/toFixed\\(4\\)/.test(webMap) || /toFixed\\(4\\)/.test(nativeMap)) {
  throw new Error('TruckMap must not expose raw coordinates in the user UI');
}

console.log('PASS here map contract');
