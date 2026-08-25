import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const api = fs.readFileSync('backend/api/profile.py', 'utf8');
const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');

test('active ProfileV2 requires name and phone for both roles while country/city stay optional', () => {
  assert.match(profile, /id="name"/);
  assert.match(profile, /id="phone"/);
  assert.match(profile, /id="company"/);
  assert.match(profile, /const formValid = validName && validPhone && validMessenger/);
  assert.match(profile, /if \(!validName\) next\.name/);
  assert.match(profile, /if \(!validPhone\) next\.phone/);
  assert.match(profile, /testID=\{`profile-v2-\$\{id\}`\}/);
  assert.match(profile, /name:\s*name\.trim\(\)/);
  assert.match(profile, /phone:\s*phone\.trim\(\)/);
  assert.match(profile, /company_name:\s*company\.trim\(\)/);
  assert.doesNotMatch(profile, /id="country"/);
  assert.doesNotMatch(profile, /id="city"/);
  assert.doesNotMatch(profile, /COUNTRY_REQUIRED/);
});

test('backend independently requires name+phone for completed driver/client onboarding, not country', () => {
  assert.match(api, /PHONE_REQUIRED/);
  assert.match(api, /NAME_REQUIRED/);
  assert.match(api, /if not effective_phone:/);
  assert.match(api, /if not effective_name:/);
  assert.match(api, /role_norm not in \("driver", "client"\)/);
  assert.doesNotMatch(api, /COUNTRY_REQUIRED/);
});

test('uploaded deal documents are openable signed attachments inside chat', () => {
  assert.match(attachments, /Linking\.openURL\(url\)/);
  assert.match(attachments, /item\?\.url \|\| item\?\.signed_url \|\| item\?\.download_url/);
  assert.match(attachments, /testID=\{onOpen \? 'deal-attachment-open'/);
  assert.match(attachments, /formatBytes\(a\.size_bytes\)/);
});
