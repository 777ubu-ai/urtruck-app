// Regression: pickDealStatus() must never let a stale/out-of-order network
// response roll the shown deal status backward, and cancelled must not
// unconditionally overwrite an already-finished deal (owner's rule, 05.08.2026
// п.6 — "cancelled не должен безусловно откатывать completed").
//
// Pure-JS unit test, no RN/Metro needed — run directly with node:
//   node tests/unit/dealStatusOrder.test.mjs
import { pickDealStatus, DEAL_STATUS_RANK } from '../../src/utils/dealStatusOrder.js';

let failed = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  ok: ' : 'FAIL: ') + desc + ` (got ${actual}, expected ${expected})`);
  if (!ok) failed++;
}

// Forward progress always applies.
check('accepted -> in_progress', pickDealStatus('accepted', 'in_progress'), 'in_progress');
check('in_progress -> at_border', pickDealStatus('in_progress', 'at_border'), 'at_border');
check('at_border -> delivered', pickDealStatus('at_border', 'delivered'), 'delivered');
check('at_border -> awaiting_confirmation', pickDealStatus('at_border', 'awaiting_confirmation'), 'awaiting_confirmation');
check('awaiting_confirmation -> delivered', pickDealStatus('awaiting_confirmation', 'delivered'), 'delivered');

// Stale/out-of-order responses must never roll the status backward.
check('at_border stale-> accepted (blocked)', pickDealStatus('at_border', 'accepted'), 'at_border');
check('delivered stale-> in_progress (blocked)', pickDealStatus('delivered', 'in_progress'), 'delivered');
check('in_progress stale-> accepted (blocked)', pickDealStatus('in_progress', 'accepted'), 'in_progress');

// cancelled is reachable from any WORKING status.
check('accepted -> cancelled', pickDealStatus('accepted', 'cancelled'), 'cancelled');
check('in_progress -> cancelled', pickDealStatus('in_progress', 'cancelled'), 'cancelled');
check('at_border -> cancelled', pickDealStatus('at_border', 'cancelled'), 'cancelled');

// The exact rule the owner asked to verify: cancelled must NOT unconditionally
// roll back an already-finished (completed/delivered) deal.
check('completed stale-> cancelled (BLOCKED, this is the point 6 rule)', pickDealStatus('completed', 'cancelled'), 'completed');
check('delivered stale-> cancelled (BLOCKED)', pickDealStatus('delivered', 'cancelled'), 'delivered');

// Once cancelled, a deal is also closed — no status resurrects it.
check('cancelled stale-> in_progress (blocked)', pickDealStatus('cancelled', 'in_progress'), 'cancelled');
check('cancelled -> cancelled (idempotent)', pickDealStatus('cancelled', 'cancelled'), 'cancelled');

// First load: no prior status, always accept the server's answer.
check('null -> at_border (first load)', pickDealStatus(null, 'at_border'), 'at_border');
check('null -> cancelled (first load)', pickDealStatus(null, 'cancelled'), 'cancelled');

// Map readiness for awaiting_confirmation/completed — no NaN/undefined ranks.
check('rank map has awaiting_confirmation', typeof DEAL_STATUS_RANK.awaiting_confirmation, 'number');
check('rank map has completed', typeof DEAL_STATUS_RANK.completed, 'number');
check('completed ranks with delivered', DEAL_STATUS_RANK.completed === DEAL_STATUS_RANK.delivered, true);
check('awaiting_confirmation between at_border and delivered',
  DEAL_STATUS_RANK.at_border < DEAL_STATUS_RANK.awaiting_confirmation && DEAL_STATUS_RANK.awaiting_confirmation < DEAL_STATUS_RANK.delivered,
  true);

console.log(failed === 0 ? '\nAll pickDealStatus tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
