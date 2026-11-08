import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('shipper EditProfile has no BIN/IIN UI or payload field', () => {
  const source = read('src/screens/EditProfileScreen.js');
  assert.doesNotMatch(source, /binInn|setBinInn|bin_inn/);
  assert.match(source, /const \[phone, setPhone\] = useState/);
  assert.match(source, /onChangeText=\{setPhone\}/);
  assert.match(source, /helper=\{t\('phone_v2_send_hint'\) \|\| t\('reg_phone_hint'\)\}/);
  // The screen may mention phone-change request/confirm after this call;
  // assert the actual PATCH payload, rather than using a distance-based
  // regex that becomes stale as the secure flow grows.
  assert.doesNotMatch(source, /payload\.phone/);
  assert.doesNotMatch(source, /updateProfile\(\s*\{[^}]*phone/);
  assert.match(source, /requestPhoneChange\(/);
  assert.match(source, /confirmPhoneChange\(/);
  assert.match(source, /phone-change-confirm/);
  assert.ok(source.indexOf('setSavedPhone(phone.trim())') > source.indexOf('confirmPhoneChange('), 'новый номер фиксируется только после confirm');
});

test('registration client exposes the authenticated phone-change flow', () => {
  const source = read('src/utils/registration.js');
  assert.match(source, /users\/me\/phone-change\/request/);
  assert.match(source, /users\/me\/phone-change\/confirm/);
  assert.match(source, /async requestPhoneChange/);
  assert.match(source, /async confirmPhoneChange/);
});

test('root headers do not restore the removed notification bell', () => {
  const rootHeader = read('src/components/ui/v1/RootHeader.js');
  const myWork = read('src/screens/MyTripsScreen.js');
  const feed = read('src/screens/FeedScreen.js');
  assert.doesNotMatch(rootHeader, /BellBadge|bellTestID|hideBell/);
  assert.doesNotMatch(myWork, /bellTestID=/);
  assert.doesNotMatch(feed, /bellTestID=/);
});
