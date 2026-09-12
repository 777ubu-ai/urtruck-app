// Track: Claude harness fix, P1 (2026-09-08/09).
//
// Root cause: PushFilter is only registered in the authenticated navigation
// stack (src/navigation/AppNavigator.js — the guest/no-role stack has
// `Main` but not `PushFilter`), yet Bell/BellBadge is rendered
// unconditionally on FeedScreen/CargoFeedScreen/MyTripsScreen/DealsScreen,
// all four of which are reachable by a guest via the `Main` route
// (RoleScreen.js's guest-browsing entry: `navigate('Main', { role, guest:
// true })`). A guest tapping Bell hit a route that doesn't exist in their
// stack — React Navigation silently no-ops.
//
// Fix: gate the Bell the same way every other account-required action on
// these screens already is (useVerificationGate/requireLevel), instead of
// leaving it broken or registering a settings route for an account a guest
// doesn't have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREENS = [
  ['src/screens/FeedScreen.js', 'feed-notification-settings-btn'],
  ['src/screens/CargoFeedScreen.js', 'cargo-feed-notification-settings-btn'],
  ['src/screens/MyTripsScreen.js', 'mywork-notification-settings-btn'],
  ['src/screens/DealsScreen.js', 'deals-notification-settings-btn'],
];

test('guest/no-role: Bell is gated behind requireLevel, never a direct unguarded navigate', () => {
  for (const [file, testID] of SCREENS) {
    const src = readFileSync(file, 'utf8');
    const idx = src.indexOf(`bellTestID="${testID}"`);
    assert.ok(idx > -1, `${file}: Bell testID not found`);
    // RootHeader owns the Bell; inspect its onBellPress contract.
    const block = src.slice(Math.max(0, idx - 100), idx + 500);
    assert.match(block, /requireLevel\(LEVELS\.PHONE, 'push_settings'/, `${file}: Bell must gate through requireLevel before navigating`);
    assert.match(block, /if \(ok\) navigation\.navigate\('PushFilter'/, `${file}: PushFilter navigation must be conditional on the gate result`);
    // The old bug: an unconditional navigate with no gate at all.
    assert.doesNotMatch(block, /onPress=\{\(\) => navigation\.navigate\('PushFilter'/, `${file}: Bell must not navigate to PushFilter unconditionally (that's the guest no-op bug)`);
  }
});

test('authenticated Driver/Shipper: gate passing leads to PushFilter', () => {
  for (const [file] of SCREENS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /navigation\.navigate\('PushFilter', \{ role \}\)/, `${file}: a passing gate must land on PushFilter with role`);
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
