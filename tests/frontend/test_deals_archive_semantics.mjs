import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

test('archive keeps completed deals separate from cancelled/rejected negotiations', () => {
  assert.match(src, /FINISHED_DEAL_STATUSES = new Set\(\['completed', 'delivered'\]\)/);
  assert.match(src, /CANCELLED_DEAL_STATUSES = new Set\(\['cancelled'\]\)/);
  assert.match(src, /CLOSED_BID_STATUSES = new Set\(\['rejected', 'cancelled', 'expired'\]\)/);
  assert.match(src, /archiveFilter === 'completed'/);
  assert.match(src, /archiveFilter === 'rejected'/);
});

test('active deals remain operational and open the protected deal chat', () => {
  assert.match(src, /ACTIVE_STATUSES = new Set\(\['accepted', 'in_progress', 'at_border', 'awaiting_confirmation'\]\)/);
  assert.match(src, /navigation\.navigate\('Chat'/);
  assert.match(src, /dealId: deal\.id/);
  assert.match(src, /roomId: deal\.chat_room_id \|\| null/);
});
