import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('App.js', 'utf8');
const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');
const route = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');

test('external deal deeplink routes through Deals instead of mounting Chat directly', () => {
  assert.match(app, /kind === 'deals' && id[\s\S]*navigate\('Deals', \{ openDealId: id, role \}\)/);
  assert.doesNotMatch(app, /kind === 'deals' && id[\s\S]{0,220}navigate\('Chat', \{ dealId: id/);
});

test('Deals opens only a deal that exists in server-backed allDeals', () => {
  assert.match(deals, /const requestedOpenDealId = route\?\.params\?\.openDealId \|\| null/);
  assert.match(deals, /allDeals\.find\(\(deal\) => String\(deal\.id\) === String\(requestedOpenDealId\)\)/);
  assert.match(deals, /openDeal\(match, \{ verified: true \}\)/);
});

test('server-backed Deals proof is passed internally and consumed before network guard', () => {
  assert.match(deals, /verifiedDealAccess: !!verified/);
  assert.match(route, /const trustedInternalAccess = params\.verifiedDealAccess === true/);
  assert.match(route, /if \(trustedInternalAccess && requestedDealId\)/);
});
