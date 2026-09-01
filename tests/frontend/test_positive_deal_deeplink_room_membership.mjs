import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const route = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');

test('direct dealId uses shared dashboard request, never forced dashboard fetch', () => {
  assert.match(chat, /const requestedDealId = params\.dealId \|\| null/);
  assert.match(chat, /marketAPI\.myDashboard\(\)/);
  assert.doesNotMatch(chat, /marketAPI\.myDashboard\(\{ force: true \}\)/);
  assert.match(chat, /dashboard\?\.my_deals/);
  assert.match(chat, /String\(item\?\.id \|\| ''\) === String\(requestedDealId\)/);
});

test('missing or unavailable dashboard membership is confirmed by participant-protected getDeal', () => {
  assert.match(chat, /marketAPI\.getDeal\(requestedDealId\)/);
  assert.match(chat, /direct && direct\.ok !== false/);
  assert.match(chat, /\[401, 403, 404\]\.includes\(Number\(direct\.status\)\)/);
  assert.match(chat, /setVerifiedDealAccess\(true\)/);
  assert.match(chat, /verifiedDealAccess: true/);
});

test('canonical route accepts only internal server-verified access without extra probe', () => {
  assert.match(route, /const trustedInternalAccess = params\.verifiedDealAccess === true/);
  assert.match(route, /if \(trustedInternalAccess && requestedDealId\)/);
});
