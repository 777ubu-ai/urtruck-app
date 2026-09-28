import assert from 'node:assert/strict';
import test from 'node:test';
import { appVersionLabel } from '../../src/utils/appVersionLabel.js';

const config = { version: '1.0.8', ios: { buildNumber: '49' }, android: { versionCode: 211040052 } };
test('Android показывает установленный APK, даже если конфиг содержит старые Android/iOS номера', () => {
  assert.equal(appVersionLabel({ nativeApplicationVersion: '1.0.8', nativeBuildVersion: '211040059' }, config, 'android'), 'v1.0.8 (211040059)');
});
test('fallback версии использует только текущую платформу', () => {
  assert.equal(appVersionLabel({}, config, 'android'), 'v1.0.8 (211040052)');
  assert.equal(appVersionLabel({}, config, 'ios'), 'v1.0.8 (49)');
  assert.equal(appVersionLabel({}, config, 'web'), 'v1.0.8');
});
test('неизвестная версия не подменяется выдуманным старым релизом', () => {
  assert.equal(appVersionLabel({}, {}, 'android'), '—');
});
