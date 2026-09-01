import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const route = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');

test('direct dealId must resolve through canonical myDashboard membership before workspace', () => {
  assert.match(chat, /const requestedDealId = params\.dealId \|\| null/);
  assert.match(chat, /marketAPI\.myDashboard\(\{ force: true \}\)/);
  assert.match(chat, /dashboard\?\.my_deals/);
  assert.match(chat, /String\(item\?\.id \|\| ''\) === String\(requestedDealId\)/);
  assert.match(chat, /setVerifiedDealAccess\(true\)/);
  assert.match(chat, /verifiedDealAccess: true/);
});

test('canonical route accepts only internal server-verified access without extra probe', () => {
  assert.match(route, /const trustedInternalAccess = params\.verifiedDealAccess === true/);
  assert.match(route, /if \(trustedInternalAccess && requestedDealId\)/);
});
