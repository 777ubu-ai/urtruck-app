import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const api = fs.readFileSync('backend/api/profile.py', 'utf8');
const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');

test('active ProfileV2 requires shipper name country and phone', () => {
  assert.match(profile, /const isShipper = role === 'client'/);
  assert.match(profile, /validName && validCountry && validPhone/);
  assert.match(profile, /profile-v2-country/);
  assert.match(profile, /profile-v2-phone/);
  assert.match(profile, /profile-v2-company/);
  assert.match(profile, /payload\.country = country\.trim\(\)/);
  assert.match(profile, /payload\.company_name = company\.trim\(\)/);
  assert.match(profile, /COUNTRY_REQUIRED/);
});

test('backend independently rejects shipper completion without identity fields', () => {
  assert.match(api, /PHONE_REQUIRED/);
  assert.match(api, /NAME_REQUIRED/);
  assert.match(api, /COUNTRY_REQUIRED/);
  assert.match(api, /role_norm == "client"/);
});

test('uploaded deal documents are openable signed attachments inside chat', () => {
  assert.match(attachments, /Linking\.openURL\(url\)/);
  assert.match(attachments, /item\?\.url \|\| item\?\.signed_url \|\| item\?\.download_url/);
  assert.match(attachments, /testID=\{onOpen \? 'deal-attachment-open'/);
  assert.match(attachments, /formatBytes\(a\.size_bytes\)/);
});
