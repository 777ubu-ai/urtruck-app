import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const api = fs.readFileSync('backend/api/profile.py', 'utf8');
const driverRegistration = fs.readFileSync('backend/api/driver_registration.py', 'utf8');
const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const profileMenu = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');

test('active ProfileV2 keeps additional company and location fields outside registration', () => {
  assert.match(profile, /id="name"/);
  assert.match(profile, /testID="profile-v2-phone"/);
  assert.doesNotMatch(profile, /id="company"/);
  assert.doesNotMatch(profile, /id="country"/);
  assert.doesNotMatch(profile, /id="city"/);
  assert.match(profile, /const basicFormValid = validName && validPhone/);
  assert.match(profile, /if \(!validName\) next\.name/);
  assert.match(profile, /if \(!validPhone\) next\.phone/);
  assert.doesNotMatch(profile, /validCompany/);
  assert.match(profile, /testID=\{`profile-v2-\$\{id\}`\}/);
  assert.match(profile, /name:\s*name\.trim\(\)/);
  assert.match(profile, /phone:\s*phone\.trim\(\)/);
  assert.doesNotMatch(profile, /COUNTRY_REQUIRED/);
});

test('driver basic form requires only name and phone; birth date and IIN are absent', () => {
  assert.match(driverRegistration, /_BASIC_REQUIRED_FIELDS = \("full_name",\)/);
  assert.doesNotMatch(profile, /id="birthDate"/);
  assert.doesNotMatch(profile, /id="iin"/);
  assert.doesNotMatch(profile, /birth_date:\s*birthDate/);
  assert.doesNotMatch(profile, /iin:\s*digitsOnly/);
  assert.match(profile, /disabled=\{!draft\.ready \|\| busy \|\| !basicFormValid\}[\s\S]*accessibilityState=\{\{ disabled: !draft\.ready \|\| busy \|\| !basicFormValid \}\}/);
  assert.ok(
    profile.indexOf('</KeyboardSafeScrollView>') < profile.indexOf('testID="profile-v2-cta"'),
    'CTA must stay visible outside the long form scroll area',
  );
});

test('backend independently requires only name+phone for both roles', () => {
  assert.match(api, /PHONE_REQUIRED/);
  assert.match(api, /NAME_REQUIRED/);
  assert.doesNotMatch(api, /COMPANY_REQUIRED/);
  assert.match(api, /if not effective_phone:/);
  assert.match(api, /if not effective_name:/);
  assert.match(api, /role_norm not in \("driver", "client"\)/);
  assert.doesNotMatch(api, /COUNTRY_REQUIRED/);
});

test('both roles share green registration without mandatory vehicle setup', () => {
  assert.match(profile, /shipperTitle: 'Профиль грузоотправителя'/);
  assert.match(profile, /const colors = registrationColors/);
  assert.doesNotMatch(profile, /navigation\.replace\('VehicleSetupCountry'/);
  assert.match(profile, /await regAPI\.completeBasic\(/);
  assert.match(profile, /await setRole\(role, \{ expectedToken: ownerToken/);
  assert.match(profile, /if \(!await formIsCurrent\(\)\) return;/);
  assert.match(profile, /navigation\.reset/);
  assert.doesNotMatch(profileMenu, /testID: 'profile-favorites'/);
  assert.doesNotMatch(profileMenu, /icon: 'heart'/);
});

test('uploaded deal documents are openable signed attachments inside chat', () => {
  assert.match(attachments, /Linking\.openURL\(url\)/);
  assert.match(attachments, /item\?\.url \|\| item\?\.signed_url \|\| item\?\.download_url/);
  assert.match(attachments, /testID=\{onOpen \? 'deal-attachment-open'/);
  assert.match(attachments, /formatBytes\(a\.size_bytes\)/);
});
