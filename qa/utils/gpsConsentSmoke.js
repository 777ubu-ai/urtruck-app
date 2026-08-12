/* Active-trip GPS contract — fast static gate for CI. */
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const api = read('backend/api/marketplace.py');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const screen = read('src/screens/ChatScreen.js');
const client = read('src/utils/marketAPI.js');

const must = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`GPS consent contract missing: ${label}`);
  console.log(`  ✓ ${label}`);
};

must(api, 'tracking.get("status") != "active"', 'location upload blocked without active consent');
must(api, 'tracking_started_with_trip', 'start trip activates tracking atomically');
must(api, 'completed_at=CURRENT_TIMESTAMP', 'delivery retains tracking record');
must(hook, 'marketAPI.activeTrackingDeals()', 'background task takes server-approved IDs');
must(screen, 'deal-action-start-delivery', 'single visible start trip control');
must(screen, 'ensureBackgroundLocationPermission()', 'OS permission is requested inside start trip');
if (screen.includes('deal-tracking-driver-request') || screen.includes('deal-action-allow-gps-start')) {
  throw new Error('GPS consent contract still exposes a separate driver action');
}
must(client, 'activeTrackingDeals()', 'mobile API client retrieves active permissions');

console.log('\n[gps-consent] OK');
