import { pickDealStatus, userFacingDealStatus, canonicalDealStatus, DEAL_STATUS_RANK } from '../../src/utils/dealStatusOrder.js';

let failed = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  ok: ' : 'FAIL: ') + desc + ` (got ${actual}, expected ${expected})`);
  if (!ok) failed++;
}

check('accepted -> in_progress', pickDealStatus('accepted', 'in_progress'), 'in_progress');
check('in_progress -> at_border', pickDealStatus('in_progress', 'at_border'), 'at_border');
check('at_border -> delivered', pickDealStatus('at_border', 'delivered'), 'delivered');
check('legacy awaiting_confirmation canonicalizes to delivered', canonicalDealStatus('awaiting_confirmation'), 'delivered');
check('legacy status is user-facing delivered', userFacingDealStatus('awaiting_confirmation'), 'delivered');
check('delivered -> received', pickDealStatus('delivered', 'received'), 'received');
check('received -> completed', pickDealStatus('received', 'completed'), 'completed');
check('authoritative completed recovers after missed received', pickDealStatus('delivered', 'completed'), 'completed');
check('at_border stale->accepted blocked', pickDealStatus('at_border', 'accepted'), 'at_border');
check('received stale->delivered blocked', pickDealStatus('received', 'delivered'), 'received');
check('accepted -> cancelled', pickDealStatus('accepted', 'cancelled'), 'cancelled');
check('in_progress -> cancelled', pickDealStatus('in_progress', 'cancelled'), 'cancelled');
check('delivered stale->cancelled blocked', pickDealStatus('delivered', 'cancelled'), 'delivered');
check('received stale->cancelled blocked', pickDealStatus('received', 'cancelled'), 'received');
check('completed stale->cancelled blocked', pickDealStatus('completed', 'cancelled'), 'completed');
check('cancelled cannot resurrect', pickDealStatus('cancelled', 'in_progress'), 'cancelled');
check('first load may accept server completed', pickDealStatus(null, 'completed'), 'completed');
check('received rank exists', typeof DEAL_STATUS_RANK.received, 'number');
check('received ranks between delivered and completed', DEAL_STATUS_RANK.delivered < DEAL_STATUS_RANK.received && DEAL_STATUS_RANK.received < DEAL_STATUS_RANK.completed, true);

console.log(failed === 0 ? '\nAll pickDealStatus tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
