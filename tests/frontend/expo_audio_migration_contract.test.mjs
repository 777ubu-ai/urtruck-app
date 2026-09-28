import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const app = JSON.parse(read('app.json')).expo;
const voice = read('src/utils/voiceRecorder.js');
const compat = read('src/utils/expoAudioCompat.js');

test('deprecated expo-av is fully removed from runtime dependencies and config', () => {
  assert.equal(pkg.dependencies['expo-av'], undefined);
  assert.match(pkg.dependencies['expo-audio'], /^~57\./);
  assert.ok(app.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio'));
  assert.doesNotMatch(JSON.stringify(app.plugins), /expo-av/);
});

test('voice runtime uses the local expo-audio compatibility layer', () => {
  assert.doesNotMatch(voice, /require\(['"]expo-av['"]\)/);
  assert.match(voice, /require\(['"]\.\/expoAudioCompat['"]\)/);
  assert.match(compat, /require\(['"]expo-audio['"]\)/);
});

test('compatibility layer preserves recording, progress, seek, rate and cleanup', () => {
  assert.match(compat, /requestRecordingPermissionsAsync/);
  assert.match(compat, /prepareToRecordAsync/);
  assert.match(compat, /playbackStatusUpdate/);
  assert.match(compat, /seekTo/);
  assert.match(compat, /setPlaybackRate/);
  assert.match(compat, /player\.remove\(\)/);
});
