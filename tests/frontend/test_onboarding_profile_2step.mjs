import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const role = read('src/screens/onboarding/RoleScreenV2.js');
const profile = read('src/screens/onboarding/ProfileV2Screen.js');
const backend = read('backend/api/profile.py');


test('role selection is explicit step 1 of 2 and preserves Role -> Profile navigation', () => {
  assert.match(role, /testID="role-v2-step"/);
  assert.match(role, />1\s*<\/Text>/);
  assert.match(role, />2\s*<\/Text>/);
  assert.match(role, /testID="role-v2-client"/);
  assert.match(role, /testID="role-v2-driver"/);
  assert.match(role, /navigation\.navigate\('ProfileV2'/);
});


test('role is not committed to AuthContext before required profile saves successfully', () => {
  assert.doesNotMatch(role, /setRole\(/);
  assert.match(profile, /const \{ session, setRole \} = useAuth\(\)/);
  const savedCheck = profile.indexOf('if (!saved?.ok)');
  const roleCommit = profile.indexOf('setRole(role)');
  assert.ok(savedCheck >= 0, 'profile must check backend save result');
  assert.ok(roleCommit > savedCheck, 'role may enter AuthContext only after successful profile save');
});


test('profile step is step 2 of 2 with name, phone and company always required', () => {
  assert.match(profile, /testID="profile-v2-step"/);
  assert.match(profile, /<Text style=\{s\.stepCaption\}>2 \/ 2<\/Text>/);
  assert.match(profile, /id="name"/);
  assert.match(profile, /id="phone"/);
  assert.match(profile, /id="company"/);
  assert.match(profile, /const validCompany = company\.trim\(\)\.length >= 2/);
  assert.match(profile, /const formValid = validName && validPhone && validCompany && validMessenger/);
  assert.match(profile, /if \(!validName\) next\.name/);
  assert.match(profile, /if \(!validPhone\) next\.phone/);
  assert.match(profile, /if \(!validCompany\) next\.company/);
  assert.doesNotMatch(profile, /validCountry/);
  assert.doesNotMatch(profile, /validCity/);
  assert.doesNotMatch(profile, /COUNTRY_REQUIRED/);
});


test('short onboarding requires company and does not ask country/city/email again', () => {
  assert.match(profile, /id="company"/);
  assert.match(profile, /company_name:\s*company\.trim\(\)/);
  assert.match(profile, /companyLabel: 'Компания \/ ИП \*'/);
  assert.doesNotMatch(profile, /Название компании \(необязательно\)/);
  assert.doesNotMatch(profile, /id="country"/);
  assert.doesNotMatch(profile, /id="city"/);
  assert.doesNotMatch(profile, /id="email"/);
  assert.doesNotMatch(profile, /keyboardType="email-address"/);
  assert.doesNotMatch(profile, /textContentType="emailAddress"/);
});


test('preferred messenger supports WhatsApp, WeChat, Telegram and Other', () => {
  for (const key of ['whatsapp', 'wechat', 'telegram', 'other']) {
    assert.match(profile, new RegExp(`key: '${key}'`));
  }
  assert.match(profile, /testID=\{`profile-v2-messenger-\$\{item\.key\}`\}/);
  assert.match(profile, /messenger_type:\s*messengerType/);
  assert.match(profile, /messenger_id:\s*messengerType \? effectiveMessengerId : ''/);
  assert.match(profile, /messengerType === 'whatsapp' && sameAsPhone/);
  assert.match(profile, /const validMessenger = !messengerType/);
  assert.match(profile, /if \(!validMessenger\) next\.messenger/);
});


test('profile stays in the light-only auth/startup theme scope', () => {
  assert.match(profile, /const colors = brandLight/);
  assert.match(profile, /makeStyles\(colors\)/);
  assert.match(profile, /backgroundColor:\s*colors\.bg/);
  assert.match(profile, /backgroundColor:\s*colors\.surface/);
  assert.doesNotMatch(profile, /PAGE_BG\s*=/);
  assert.doesNotMatch(profile, /SURFACE\s*=/);
});


test('backend onboarding contract requires name+phone+company for both roles but not country', () => {
  assert.match(backend, /if not effective_phone:/);
  assert.match(backend, /"error": "PHONE_REQUIRED"/);
  assert.match(backend, /if not effective_name:/);
  assert.match(backend, /"error": "NAME_REQUIRED"/);
  assert.match(backend, /if not effective_company/);
  assert.match(backend, /"error": "COMPANY_REQUIRED"/);
  assert.doesNotMatch(backend, /COUNTRY_REQUIRED/);
  assert.match(backend, /"other"/);
});


test('privacy contract does not expose phone or messenger in counterparty response', () => {
  const start = backend.indexOf('def get_counterparty_profile');
  const end = backend.indexOf('@profile_router.patch("/me")', start);
  assert.ok(start >= 0 && end > start, 'counterparty endpoint must exist');
  const block = backend.slice(start, end);
  assert.doesNotMatch(block, /"phone"\s*:/);
  assert.doesNotMatch(block, /"messenger_id"\s*:/);
});


test('legacy RegProfile also requires phone and company before entering app', () => {
  const legacy = read('src/screens/registration/PremiumProfileScreen.js');
  assert.match(legacy, /company: 'Компания \/ ИП \*'/);
  assert.match(legacy, /companyRequired: 'Укажите компанию или ИП'/);
  assert.match(legacy, /const validCompany = company\.trim\(\)\.length >= 2/);
  assert.match(legacy, /const driverReady = validName && validPhone && validCompany/);
  assert.match(legacy, /const shipperReady = validName && validCountry && validPhone && validCompany/);
  assert.match(legacy, /if \(!validPhone\) nextErrors\.phone/);
  assert.match(legacy, /if \(!validCompany\) nextErrors\.company/);
  assert.match(legacy, /company_name: trimmedCompany/);
  assert.match(legacy, /testID="prem-reg-profile-phone"/);
  assert.match(legacy, /testID="prem-reg-profile-company"/);
  assert.doesNotMatch(legacy, /Название компании \(необязательно\)/);
});
