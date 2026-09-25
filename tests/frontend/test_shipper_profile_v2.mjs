import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const api = fs.readFileSync('backend/api/profile.py', 'utf8');
const driverRegistration = fs.readFileSync('backend/api/driver_registration.py', 'utf8');
const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const profileMenu = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');

test('active ProfileV2 keeps company optional for basic drivers and required for clients', () => {
  assert.match(profile, /id="name"/);
  assert.match(profile, /id="phone"/);
  assert.match(profile, /id="company"/);
  assert.match(profile, /const validCompany = role === 'driver' \|\| company\.trim\(\)\.length >= 2/);
  assert.match(profile, /const formValid = validName && validPhone && validCompany && validMessenger/);
  assert.match(profile, /if \(!validName\) next\.name/);
  assert.match(profile, /if \(!validPhone\) next\.phone/);
  assert.match(profile, /if \(!validCompany\) next\.company/);
  assert.match(profile, /testID=\{`profile-v2-\$\{id\}`\}/);
  assert.match(profile, /name:\s*name\.trim\(\)/);
  assert.match(profile, /phone:\s*phone\.trim\(\)/);
  assert.match(profile, /company_name:\s*company\.trim\(\)/);
  assert.doesNotMatch(profile, /id="country"/);
  assert.doesNotMatch(profile, /id="city"/);
  assert.doesNotMatch(profile, /COUNTRY_REQUIRED/);
});

test('driver basic form matches backend: IIN optional, date format explained, CTA always reachable', () => {
  assert.match(driverRegistration, /_BASIC_REQUIRED_FIELDS = \("full_name", "birth_date"\)/);
  assert.match(profile, /const validIin = role !== 'driver' \|\| !iinDigits \|\|/);
  assert.match(profile, /const basicFormValid = formValid && validBirthDate;/);
  assert.doesNotMatch(profile, /basicFormValid = formValid && validBirthDate && validIin/);
  assert.match(profile, /placeholder=\{ui\.birthDatePlaceholder\}/);
  assert.match(profile, /if \(role === 'driver' && iinDigits && !validIin\)/);
  assert.match(profile, /disabled=\{busy\}[\s\S]*accessibilityState=\{\{ disabled: busy \}\}/);
  assert.ok(
    profile.indexOf('</KeyboardSafeScrollView>') < profile.indexOf('testID="profile-v2-cta"'),
    'CTA must stay visible outside the long form scroll area',
  );
});

test('backend independently requires name+phone for drivers and company for clients, not country', () => {
  assert.match(api, /PHONE_REQUIRED/);
  assert.match(api, /NAME_REQUIRED/);
  assert.match(api, /COMPANY_REQUIRED/);
  assert.match(api, /if not effective_phone:/);
  assert.match(api, /if not effective_name:/);
  assert.match(api, /role_norm == "client" and/);
  assert.match(api, /role_norm not in \("driver", "client"\)/);
  assert.doesNotMatch(api, /COUNTRY_REQUIRED/);
});

test('shipper has its own visual identity and never enters driver vehicle setup', () => {
  assert.match(profile, /shipperTitle: 'Профиль грузоотправителя'/);
  assert.match(profile, /shipperColors/);
  assert.match(profile, /primary: '#C2410C'/);
  assert.match(profile, /if \(role === 'driver'\)[\s\S]*regAPI\.completeBasic\(\)/);
  assert.match(profile, /setRole\('driver'\);\s*navigation\.reset/);
  assert.doesNotMatch(profile, /navigation\.replace\('VehicleSetupCountry', \{ role: 'driver', origin: 'basic_onboarding' \}\)/);
  assert.doesNotMatch(profileMenu, /testID: 'profile-favorites'/);
  assert.doesNotMatch(profileMenu, /icon: 'heart'/);
});

test('uploaded deal documents are openable signed attachments inside chat', () => {
  assert.match(attachments, /Linking\.openURL\(url\)/);
  assert.match(attachments, /item\?\.url \|\| item\?\.signed_url \|\| item\?\.download_url/);
  assert.match(attachments, /testID=\{onOpen \? 'deal-attachment-open'/);
  assert.match(attachments, /formatBytes\(a\.size_bytes\)/);
});
