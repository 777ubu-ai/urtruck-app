// Static client contract: UI must not show a completed/reviewable deal before
// the shipper confirms receipt, and API failures must never look successful.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const reviews = read('src/utils/reviews.js');
const cargo = read('src/screens/CargoDetail.js');
const trip = read('src/screens/TripDetail.js');
const chat = read('src/screens/ChatScreen.js');
const i18n = read('src/utils/i18n.js');

assert.match(reviews, /deal_id:\s*dealId/);
assert.match(reviews, /if \(!r\.ok\)/);
assert.match(reviews, /ok:\s*false/);

for (const screen of [cargo, trip]) {
  assert.match(screen, /dealStatus === 'completed'/);
  assert.match(screen, /dealId:/);
  assert.match(screen, /if \(!review\?\.ok\)/);
}

assert.match(chat, /\['awaiting_confirmation', 'delivered'\]\.includes\(deal\.status\)/);
assert.match(chat, /key:\s*'completed'/);
assert.match(chat, /driver_next_step_awaiting_confirmation/);

for (const key of [
  'status_awaiting_confirmation',
  'deal_event_status_awaiting_confirmation',
  'deal_event_status_completed',
  'driver_next_step_awaiting_confirmation',
  'shipper_next_step_awaiting_confirmation',
]) {
  const occurrences = i18n.match(new RegExp(`(?:^|\\s)${key}:`, 'gm'))?.length || 0;
  assert.equal(occurrences, 4, `${key} must exist in RU/KK/ZH/EN`);
}

console.log('Deal completion/review client contract passed.');
