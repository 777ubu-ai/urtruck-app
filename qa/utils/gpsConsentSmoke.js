/* GPS consent contract — fast static gate for CI.
 *
 * The full behaviour is covered by backend API tests on the Python runner;
 * this check prevents a future UI change from quietly returning to automatic
 * tracking based only on a deal's logistics status.
 */
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

must(api, '@mp_router.post("/deals/{deal_id}/tracking/request")', 'shipper request endpoint');
must(api, '@mp_router.post("/deals/{deal_id}/tracking/respond")', 'driver consent endpoint');
must(api, '@mp_router.post("/deals/{deal_id}/tracking/stop")', 'pre-pickup withdrawal endpoint');
must(api, 'tracking.get("status") != "active"', 'location upload blocked without active consent');
must(api, 'TRACKING_REQUIRED_BEFORE_PICKUP', 'pickup blocked without tracking consent');
must(api, 'tracking_locked_at_pickup', 'pickup locks GPS evidence');
must(api, 'completed_at=CURRENT_TIMESTAMP', 'delivery retains tracking record');
must(hook, 'marketAPI.activeTrackingDeals()', 'background task takes server-approved IDs');
must(screen, 'deal-request-tracking', 'shipper request control');
must(screen, 'deal-tracking-allow', 'driver approval control');
must(screen, 'ensureBackgroundLocationPermission()', 'OS permission before server approval');
must(screen, "deal?.status === 'accepted' && tracking?.status === 'active'", 'driver stop control is pre-pickup only');
must(client, 'activeTrackingDeals()', 'mobile API client retrieves active permissions');

console.log('\n[gps-consent] OK');
