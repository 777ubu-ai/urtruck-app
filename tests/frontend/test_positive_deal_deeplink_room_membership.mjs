import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const route = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');

test('direct dealId must resolve through current-user rooms before workspace', () => {
  assert.match(chat, /rooms\.find\(\(item\) => String\(item\.deal_id\) === String\(params\.dealId\)\)/);
  assert.match(chat, /verifiedDealAccess: Boolean\(room\?\.deal_id/);
});

test('canonical route accepts only internal room-verified access without extra probe', () => {
  assert.match(route, /const trustedInternalAccess = params\.verifiedDealAccess === true/);
  assert.match(route, /if \(trustedInternalAccess && requestedDealId\)/);
});
