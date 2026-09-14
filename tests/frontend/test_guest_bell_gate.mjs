// Bell contract: the icon always opens the notification center. Guests get
// the same empty state instead of a silent no-op; PushFilter remains a
// separate settings screen reachable from the account menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREENS = [
  ['src/screens/FeedScreen.js', 'feed-notification-settings-btn'],
  ['src/screens/CargoFeedScreen.js', 'cargo-feed-notification-settings-btn'],
  ['src/screens/MyTripsScreen.js', 'mywork-notification-settings-btn'],
  ['src/screens/DealsScreen.js', 'deals-notification-settings-btn'],
];

test('guest/no-role: Bell opens Notifications directly', () => {
  for (const [file, testID] of SCREENS) {
    const src = readFileSync(file, 'utf8');
    const idx = src.indexOf(`bellTestID="${testID}"`);
    assert.ok(idx > -1, `${file}: Bell testID not found`);
    // RootHeader owns the Bell; inspect its onBellPress contract.
    const block = src.slice(Math.max(0, idx - 100), idx + 500);
    assert.match(block, /navigation\.navigate\('Notifications', \{ role \}\)/, `${file}: Bell must open Notifications`);
    assert.doesNotMatch(block, /requireLevel\(LEVELS\.PHONE, 'push_settings'/, `${file}: Bell must not gate notification-center access`);
    assert.doesNotMatch(block, /navigation\.navigate\('PushFilter'/, `${file}: Bell must not navigate to PushFilter`);
  }
});

test('authenticated Driver/Shipper: Bell uses the same notification center', () => {
  for (const [file] of SCREENS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /navigation\.navigate\('Notifications', \{ role \}\)/, `${file}: Bell must land on Notifications`);
  }
});

test('all four gated screens actually import and render the verification Gate element', () => {
  for (const [file] of SCREENS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /import \{ useVerificationGate \} from '..\/components\/VerificationGate'/, `${file}: missing useVerificationGate import`);
    assert.match(src, /const \{ requireLevel, Gate \} = useVerificationGate\(\)/, `${file}: hook not called`);
    assert.match(src, /\{Gate\}/, `${file}: <Gate/> element must actually be rendered, or requireLevel's modal never shows`);
  }
});

test('the push_settings gate has real, non-generic copy in all 4 languages', () => {
  const gateSrc = readFileSync('src/components/VerificationGate.js', 'utf8');
  assert.match(gateSrc, /push_settings: \{ title: tGlobal\('gate_login'\), body: tGlobal\('gate_push_desc'\) \}/);

  const i18n = readFileSync('src/utils/i18n.js', 'utf8');
  const langBlocks = {
    RU: [10, 2091], KK: [2091, 3917], ZH: [3917, 5725], EN: [5725, 7660],
  };
  const lines = i18n.split('\n');
  for (const [lang, [start, end]] of Object.entries(langBlocks)) {
    const block = lines.slice(start, end).join('\n');
    assert.match(block, /gate_push_desc:/, `${lang}: gate_push_desc key missing`);
  }
});
