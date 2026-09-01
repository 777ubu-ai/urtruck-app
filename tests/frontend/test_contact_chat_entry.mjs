import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatRouter = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const driverDetail = fs.readFileSync('src/screens/DriverDetail.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

// P0 2026-09-01: логика членства по комнатам живёт в чистом резолвере
// src/utils/dealLinkGuard.js (runtime-тесты — test_deal_deeplink_guard_
// runtime.mjs); экран держит только конечные состояния.
const linkGuard = fs.readFileSync('src/utils/dealLinkGuard.js', 'utf8');

test('driver profile partner-only chat entry resolves a deal-linked room before legacy fallback', () => {
  assert.match(driverDetail, /navigation\.navigate\('Chat', \{ partner: driver, role \}\)/);
  assert.match(chatRouter, /const partnerId = params\.partner\?\.id \|\| null/);
  assert.match(linkGuard, /Array\.isArray\(data\?\.rooms\) \? data\.rooms : \[\]/);
  assert.match(linkGuard, /item\.deal_id && String\(item\.partner_id\) === String\(partnerId\)/);
  assert.match(chatRouter, /resolveDealLinkAccess\(\{/);
  assert.match(chatRouter, /return <DealWorkspaceRoute/);
});

test('partner-only contact without an accepted deal fails closed instead of opening legacy chat', () => {
  // Партнёр без принятой сделки → конечный DENIED (комнаты без deal_id не
  // дают доступа), экран «Нет доступа к этой сделке» с кнопкой «К сделкам».
  assert.match(linkGuard, /if \(room\?\.deal_id\)/);
  assert.match(linkGuard, /return done\(\{ state: DEAL_ACCESS\.DENIED, source: 'rooms', status: 0 \}\)/);
  assert.match(chatRouter, /guard\.state === DEAL_ACCESS\.DENIED/);
  assert.match(chatRouter, /navigation\.navigate\('Deals', \{ role: params\.role \}\)/);
  assert.match(chatRouter, /testID="deal-access-denied"/);
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
