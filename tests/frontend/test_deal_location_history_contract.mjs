import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('backend/api/marketplace.py', 'utf8');
const screen = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

assert.match(backend, /SELECT lat, lng, heading, speed, captured_at_ms, updated_at FROM deal_locations/);
assert.match(backend, /tracking_status.*deal_status/);
assert.doesNotMatch(backend, /if \(tracking\.get\("status"\) != "active"\):\n\s+return \{"ok": True, "has_location": False/);
assert.match(screen, /const LOCATION_HISTORY_STATUSES = \[\.\.\.LIVE_TRACKING_STATUSES, 'delivered', 'received', 'completed'\]/);
assert.match(screen, /const locationReadable = Boolean\(dealId && LOCATION_HISTORY_STATUSES\.includes\(deal\?\.status\)\)/);
assert.match(screen, /const hasLivePoint = trackingActive && hasCoordinates/);
assert.match(screen, /if \(!trackingActive\) return undefined;/);

console.log('deal location history contract: PASS');
