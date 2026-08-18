import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('backend/api/profile.py', 'utf8');
const client = fs.readFileSync('src/utils/dealCounterpartyAPI.js', 'utf8');
const chat = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const cargo = fs.readFileSync('src/screens/CargoDetailV2.js', 'utf8');
const trip = fs.readFileSync('src/screens/TripDetailV2.js', 'utf8');

test('counterparty identity endpoint is available only to users sharing a deal', () => {
  assert.match(api, /@profile_router\.get\("\/counterparty\/\{other_user_id\}"\)/);
  assert.match(api, /SELECT id FROM deals/);
  assert.match(api, /shipper_id = \? AND driver_id = \?/);
  assert.match(api, /COUNTERPARTY_FORBIDDEN/);
  assert.match(api, /status_code=403/);
});

test('safe counterparty response exposes business identity but not private contacts or documents', () => {
  const endpoint = api.slice(api.indexOf('@profile_router.get("/counterparty/{other_user_id}")'), api.indexOf('@profile_router.patch("/me")'));
  assert.match(endpoint, /"name"/);
  assert.match(endpoint, /"country"/);
  assert.match(endpoint, /"company_name"/);
  assert.match(endpoint, /"vehicle_plate"/);
  assert.doesNotMatch(endpoint, /"phone"\s*:/);
  assert.doesNotMatch(endpoint, /"bin_inn"\s*:/);
  assert.doesNotMatch(endpoint, /"messenger_id"\s*:/);
  assert.doesNotMatch(endpoint, /"passport_intl_url"\s*:/);
});

test('active deal routes enrich header with participant-only name company and country', () => {
  assert.match(client, /users\/counterparty/);
  assert.match(client, /profile\.name, profile\.company_name, profile\.country/);
  assert.match(chat, /getDealCounterpartyProfile\(room\.partner_id\)/);
  assert.match(cargo, /getDealCounterpartyProfile\(room\.partner_id\)/);
  assert.match(trip, /getDealCounterpartyProfile\(room\.partner_id\)/);
  assert.match(chat, /partner: resolvedPartner/);
  assert.match(cargo, /partner: target\.partner/);
  assert.match(trip, /partner: target\.partner/);
});
