import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT_SCREENS = [
  'src/screens/FeedScreen.js',
  'src/screens/CargoFeedScreen.js',
  'src/screens/MyTripsScreen.js',
  'src/screens/DealsScreen.js',
];

test('root screens never expose a Bell or notification-inbox entry point', () => {
  for (const file of ROOT_SCREENS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /<RootHeader\b/, `${file}: canonical RootHeader missing`);
    assert.doesNotMatch(src, /bellTestID=|onBellPress=/, `${file}: Bell wiring must be hidden`);
    assert.doesNotMatch(src, /deals-notification-inbox/, `${file}: root must not expose a notification inbox`);
    assert.doesNotMatch(src, /navigation\.navigate\('Notifications', \{ role \}\)/, `${file}: root must not expose notification center`);
  }
});

test('verification Gate remains mounted for other gated root actions', () => {
  for (const file of ROOT_SCREENS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /import \{ useVerificationGate \} from '..\/components\/VerificationGate'/, `${file}: missing useVerificationGate import`);
    assert.match(src, /const \{ requireLevel, Gate \} = useVerificationGate\(\)/, `${file}: hook not called`);
    assert.match(src, /\{Gate\}/, `${file}: Gate must remain rendered`);
  }
});

test('push_settings copy remains localized because push filters/backend are still active', () => {
  const gateSrc = readFileSync('src/components/VerificationGate.js', 'utf8');
  assert.match(gateSrc, /push_settings: \{ title: tGlobal\('gate_login'\), body: tGlobal\('gate_push_desc'\) \}/);
  const i18n = readFileSync('src/utils/i18n.js', 'utf8');
  for (const key of ['RU:', 'KK:', 'ZH:', 'EN:']) assert.match(i18n, new RegExp(key));
  assert.ok((i18n.match(/gate_push_desc:/g) || []).length >= 4);
});
