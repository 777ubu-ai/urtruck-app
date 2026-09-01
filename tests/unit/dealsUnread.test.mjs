import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDealsUnread } from '../../src/utils/dealsUnread.js';

const NOW = Date.parse('2026-09-01T12:00:00Z');
const isoHoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

const trackingDashboard = {
  my_deals: [
    { status: 'accepted', unread_count: 0, tracking_action_required: 1 },
    { status: 'completed', unread_count: 9, tracking_action_required: 1 },
  ],
  my_bids: [],
  incoming_bids: [],
};

assert.equal(computeDealsUnread(trackingDashboard, { role: 'driver', now: NOW }), 1);
console.log('✓ active GPS request is visible, archived unread/tracking is ignored in Deals badge');

// Device regression 2026-09-01:
// DealsScreen showed Offers attention=0 and Active attention=0, but BottomNav
// stayed at 1 after force-stop/reopen. The old helper counted every pending /
// countered row in myDashboard even when DealsScreen hid it because it was
// expired (>48h) or belonged to the other role.
const clientDashboard = {
  my_deals: [],
  my_bids: [
    { id: 'cross-role-outgoing', status: 'countered', cargo_id: 'cargo-old', updated_at: isoHoursAgo(1) },
  ],
  incoming_bids: [
    { id: 'expired-cargo', status: 'pending', cargo_id: 'cargo-expired', updated_at: isoHoursAgo(49) },
    { id: 'fresh-cargo', status: 'pending', cargo_id: 'cargo-fresh', updated_at: isoHoursAgo(1) },
    { id: 'driver-trip-only', status: 'pending', trip_id: 'trip-1', updated_at: isoHoursAgo(1) },
  ],
};

assert.equal(
  computeDealsUnread(clientDashboard, { role: 'client', now: NOW }),
  1,
  'client badge must count only fresh incoming cargo bids visible in client Deals',
);

clientDashboard.incoming_bids[1].status = 'rejected';
assert.equal(
  computeDealsUnread(clientDashboard, { role: 'client', now: NOW }),
  0,
  'expired/cross-role hidden bids must not keep a ghost Deals badge',
);
console.log('✓ client ghost badge regression: expired/cross-role bids are ignored');

const driverDashboard = {
  my_deals: [],
  my_bids: [
    { id: 'driver-counter', status: 'countered', cargo_id: 'cargo-1', updated_at: isoHoursAgo(1) },
  ],
  incoming_bids: [
    { id: 'trip-incoming', status: 'pending', trip_id: 'trip-1', updated_at: isoHoursAgo(1) },
    { id: 'cargo-incoming-client-only', status: 'pending', cargo_id: 'cargo-2', updated_at: isoHoursAgo(1) },
    { id: 'expired-trip', status: 'pending', trip_id: 'trip-2', updated_at: isoHoursAgo(49) },
  ],
};

assert.equal(
  computeDealsUnread(driverDashboard, { role: 'driver', now: NOW }),
  2,
  'driver badge must match visible driver Deals offers: outgoing counter + incoming trip bid',
);
console.log('✓ driver badge is role-aware and TTL-aware');

const bottomNavSource = readFileSync(new URL('../../src/components/ui/v1/BottomNav.js', import.meta.url), 'utf8');
assert.match(bottomNavSource, /computeDealsUnread\(dashboard, \{ role \}\)/);
assert.match(bottomNavSource, /\[hasToken, role\]/);
console.log('✓ BottomNav passes active role and refreshes when role changes');

const appBadgeSource = readFileSync(new URL('../../src/utils/appBadge.js', import.meta.url), 'utf8');
assert.match(appBadgeSource, /storage\.get\('ur_session'\)/);
assert.match(appBadgeSource, /computeDealsUnread\(dashboard, \{ role \}\)/);
console.log('✓ launcher badge uses the same role-aware Deals formula');
