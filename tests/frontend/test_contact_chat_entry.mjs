import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatRouter = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const driverDetail = fs.readFileSync('src/screens/DriverDetail.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

test('driver profile partner-only chat entry resolves a deal-linked room before legacy fallback', () => {
  assert.match(driverDetail, /navigation\.navigate\('Chat', \{ partner: driver, role \}\)/);
  assert.match(chatRouter, /const partnerId = params\.partner\?\.id \|\| null/);
  assert.match(chatRouter, /Array\.isArray\(data\?\.rooms\) \? data\.rooms : \[\]/);
  assert.match(chatRouter, /item\.deal_id && String\(item\.partner_id\) === String\(partnerId\)/);
  assert.match(chatRouter, /const nextDealId = params\.dealId \|\| room\?\.deal_id \|\| null/);
  assert.match(chatRouter, /return <DealWorkspaceRoute/);
});

test('partner-only contact without an accepted deal fails closed instead of opening legacy chat', () => {
  assert.match(chatRouter, /const \[blockedPartnerEntry, setBlockedPartnerEntry\] = React\.useState\(false\)/);
  assert.match(chatRouter, /const partnerOnlyWithoutDeal = Boolean\(partnerId && !roomId && !nextDealId\)/);
  assert.match(chatRouter, /setBlockedPartnerEntry\(partnerOnlyWithoutDeal\)/);
  assert.match(chatRouter, /navigation\.navigate\('Deals', \{ role: params\.role \}\)/);
  assert.match(chatRouter, /if \(!checked \|\| blockedPartnerEntry\)/);
});

test('driver active trip has the same management symmetry: edit plus unpublish', () => {
  assert.match(myTrips, /testID="my-trip-edit-btn"/);
  assert.match(myTrips, /testID="my-trip-unpublish-btn"/);
  assert.match(myTrips, /marketAPI\.unpublishTrip\(item\.id\)/);
  assert.match(myTrips, /confirmAction\(t\('trip_delete_q'\), t\('trip_delete'\), true\)/);
});

test('external phone Telegram WhatsApp handoff helper is absent from product source', () => {
  assert.equal(fs.existsSync('src/utils/contactPartner.js'), false);
});
