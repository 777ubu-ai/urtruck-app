import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const api = fs.readFileSync('backend/api/profile.py', 'utf8');
const driverRegistration = fs.readFileSync('backend/api/driver_registration.py', 'utf8');
const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const profileMenu = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');

test('active ProfileV2 keeps company and location optional for both roles', () => {
  assert.match(profile, /id="name"/);
  assert.match(profile, /id="phone"/);
  assert.match(profile, /id="company"/);
  assert.match(profile, /id="country"/);
  assert.match(profile, /id="city"/);
  assert.match(profile, /const basicFormValid = validName && validPhone && validMessenger/);
  assert.match(profile, /if \(!validName\) next\.name/);
  assert.match(profile, /if \(!validPhone\) next\.phone/);
  assert.doesNotMatch(profile, /validCompany/);
  assert.match(profile, /testID=\{`profile-v2-\$\{id\}`\}/);
  assert.match(profile, /name:\s*name\.trim\(\)/);
  assert.match(profile, /phone:\s*phone\.trim\(\)/);
  assert.match(profile, /company_name:\s*company\.trim\(\)/);
  assert.match(profile, /country:\s*country\.trim\(\)/);
  assert.match(profile, /city:\s*city\.trim\(\)/);
  assert.doesNotMatch(profile, /COUNTRY_REQUIRED/);
});

test('driver basic form requires only name and phone; birth date and IIN are absent', () => {
  assert.match(driverRegistration, /_BASIC_REQUIRED_FIELDS = \("full_name",\)/);
  assert.doesNotMatch(profile, /id="birthDate"/);
  assert.doesNotMatch(profile, /id="iin"/);
  assert.doesNotMatch(profile, /birth_date:\s*birthDate/);
  assert.doesNotMatch(profile, /iin:\s*digitsOnly/);
  assert.match(profile, /disabled=\{busy\}[\s\S]*accessibilityState=\{\{ disabled: busy \}\}/);
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

test('shipper has its own visual identity while only driver enters vehicle setup', () => {
  assert.match(profile, /shipperTitle: 'Профиль грузоотправителя'/);
  assert.match(profile, /shipperColors/);
  assert.match(profile, /primary: '#C2410C'/);
  assert.match(profile, /if \(role === 'driver'\)[\s\S]*navigation\.replace\('VehicleSetupCountry'/);
  assert.match(profile, /setRole\(role\);\s*navigation\.reset/);
  assert.doesNotMatch(profileMenu, /testID: 'profile-favorites'/);
  assert.doesNotMatch(profileMenu, /icon: 'heart'/);
});

test('uploaded deal documents are openable signed attachments inside chat', () => {
  assert.match(attachments, /Linking\.openURL\(url\)/);
  assert.match(attachments, /item\?\.url \|\| item\?\.signed_url \|\| item\?\.download_url/);
  assert.match(attachments, /testID=\{onOpen \? 'deal-attachment-open'/);
  assert.match(attachments, /formatBytes\(a\.size_bytes\)/);
});
