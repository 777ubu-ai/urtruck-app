import test from 'node:test';
import assert from 'node:assert/strict';
import { Platform, Linking } from 'react-native';
import { openLocationSettings } from '../../src/utils/locationSettings.js';

test('web settings recovery fails closed without calling native Linking.openSettings', async () => {
  const original = Platform.OS;
  try {
    Platform.OS = 'web';
    Linking.__resetOpenSettingsCalls();

    const result = await openLocationSettings();

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'web_settings_manual');
    assert.equal(Linking.__getOpenSettingsCalls(), 0);
  } finally {
    Platform.OS = original;
    Linking.__resetOpenSettingsCalls();
  }
});

test('native settings recovery still calls Linking.openSettings when supported', async () => {
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    Linking.__resetOpenSettingsCalls();

    const result = await openLocationSettings();

    assert.equal(result.ok, true);
    assert.equal(Linking.__getOpenSettingsCalls(), 1);
  } finally {
    Platform.OS = original;
    Linking.__resetOpenSettingsCalls();
  }
});
