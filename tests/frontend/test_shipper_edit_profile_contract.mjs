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
  assert.doesNotMatch(source, /updateProfile\([\s\S]{0,500}phone/);
});

test('shipper Queue hides the bell while driver Queue keeps it', () => {
  const source = read('src/screens/QueueScreenLazyV2.js');
  assert.match(source, /<RootHeader[^>]*hideBell=\{!isDriver\}/);
  assert.match(source, /<RootHeader[^>]*onBellPress=\{async \(\) => \{/);
});

test('bell is limited to the two shipper main screens', () => {
  const myWork = read('src/screens/MyTripsScreen.js');
  const feed = read('src/screens/FeedScreen.js');
  const deals = read('src/screens/DealsScreen.js');
  const queue = read('src/screens/QueueScreenLazyV2.js');
  assert.match(myWork, /bellTestID="mywork-notification-settings-btn"/);
  assert.match(feed, /bellTestID="feed-notification-settings-btn"/);
  assert.match(deals, /hideBell=\{!isDriver\}/);
  assert.match(queue, /hideBell=\{!isDriver\}/);
});
