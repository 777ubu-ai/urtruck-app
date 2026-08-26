import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(fs.readFileSync('qa/protected_features.json', 'utf8'));
const guard = fs.readFileSync('qa/utils/protectedFeatureGuard.mjs', 'utf8');

test('protected feature manifest covers the release-critical UrTruck areas', () => {
  const ids = new Set(manifest.features.map((feature) => feature.id));
  for (const id of [
    'map_gps',
    'push_notifications',
    'chat_media',
    'deal_fsm',
    'offer_expiration',
    'counters_badges',
    'i18n_ru_zh_en',
    'dark_mode',
    'secrets_and_build_keys',
  ]) {
    assert.ok(ids.has(id), `missing protected feature ${id}`);
  }
});

test('every protected feature has valid regex patterns and executable commands', () => {
  const ids = new Set();
  for (const feature of manifest.features) {
    assert.match(feature.id, /^[a-z0-9_]+$/);
    assert.ok(!ids.has(feature.id), `duplicate id ${feature.id}`);
    ids.add(feature.id);
    assert.ok(feature.label);
    assert.ok(feature.risk);
    assert.ok(feature.file_patterns.length > 0, `${feature.id} has no patterns`);
    assert.ok(feature.commands.length > 0, `${feature.id} has no commands`);
    for (const pattern of feature.file_patterns) assert.doesNotThrow(() => new RegExp(pattern));
    for (const command of feature.commands) {
      assert.doesNotMatch(command, /\b(curl|wget)\b/, `${feature.id} must not depend on network smoke in PR guard`);
      assert.doesNotMatch(command, /\bprintenv\b|\bset -x\b/, `${feature.id} must not leak secrets`);
    }
  }
});

test('guard can run selected feature commands from changed files, not only print documentation', () => {
  assert.match(guard, /spawnSync\(command/);
  assert.match(guard, /--run/);
  assert.match(guard, /git.*diff/s);
  assert.match(guard, /PROTECTED_FEATURE_CHANGED_FILES/);
});
