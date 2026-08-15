import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const role = read('src/screens/onboarding/RoleScreenV2.js');
const phone = read('src/screens/onboarding/PhoneV2Screen.js');
const otp = read('src/screens/onboarding/OtpV2Screen.js');
const api = read('src/utils/registration.js');
const i18n = read('src/utils/i18n.js');

assert.match(role, /await regAPI\.selectRole\(selected\)/);
assert.match(role, /phone_verification_required/);
assert.match(role, /purpose: 'driver_phone'/);
assert.match(phone, /isDriverPhone \? 'phone' : 'email'/);
assert.match(phone, /!isDriverPhone && <View[^>]+testID="auth-channel-segment"/);
assert.match(phone, /purpose: route\?\.params\?\.purpose/);
assert.match(otp, /await regAPI\.bindPhone\(phone, c\)/);
assert.match(otp, /await regAPI\.selectRole\('driver'\)/);
assert.match(otp, /resumeScreen \|\| 'ProfileV2'/);
assert.match(api, /\/phone\/bind\/verify/);
assert.match(api, /fetch\(`\$\{BASE\}\/role`/);

for (const key of ['driver_phone_title', 'driver_phone_subtitle', 'driver_phone_send_hint', 'role_v2_save_failed']) {
  assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) || []).length, 4, `${key} must exist in RU/KK/ZH/EN`);
}

console.log('driver phone onboarding contract: PASS');
