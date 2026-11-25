import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const screens = [
  ['cargo feed', 'src/screens/CargoFeedScreen.js'],
  ['vehicle feed', 'src/screens/FeedScreen.js'],
];

for (const [name, path] of screens) {
  const source = fs.readFileSync(path, 'utf8');

  test(`${name} starts one focused load and ignores stale responses`, () => {
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{/);
    assert.match(source, /const requestId = \+\+loadRequestRef\.current/);
    assert.match(source, /if \(requestId !== loadRequestRef\.current\) return;/);
    assert.match(source, /if \(requestId === loadRequestRef\.current\)/);
    assert.match(source, /return \(\) => \{ loadRequestRef\.current \+= 1; \};/);
    assert.doesNotMatch(source, /useEffect\(\(\) => \{ load\(\); \}, \[load\]\)/);
  });
}

test('feed count keeps the last confirmed value across failures and is scoped to API, kind and owner', () => {
  const source = fs.readFileSync('src/components/externalFreight/ExternalFreightEntry.js', 'utf8');
  assert.match(source, /external_feed_count_v1:\$\{API_BASE\}:\$\{kind\}:\$\{ownerKey\}/);
  assert.match(source, /storage\.get\(countCacheKey\)/);
  assert.match(source, /storage\.set\(countCacheKey, JSON\.stringify\(confirmed\)\)/);
  assert.match(source, /if \(data\.ok && data\.kind === kind && Number\.isSafeInteger\(data\.count\)/);
  assert.match(source, /countText \?\? '—'/);
  assert.doesNotMatch(source, /setResult\(null\)/);
});

test('external freight route is available after sign-in when the flag is enabled', () => {
  const source = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
  const [onboarding, signedIn] = source
    .split('<Stack.Navigator key={navKey}')[1]
    .split('// Полностью в приложении');
  assert.doesNotMatch(onboarding, /name="ExternalFreightFeed"/);
  assert.match(signedIn, /EXTERNAL_FREIGHT_ENABLED \? <Stack\.Screen name="ExternalFreightFeed"/);
});
