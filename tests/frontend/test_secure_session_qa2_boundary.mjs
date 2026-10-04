import test from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// This file gets its own node:test worker. Set the build-time override before
// env.js is imported, matching a production-package → QA2-package update.
process.env.EXPO_PUBLIC_API_URL = 'https://qa2.urtruck.kz';
Platform.OS = 'android';

const { storage } = await import('../../src/utils/storage.js?qa2-boundary');

test('QA2 never reads or deletes an unscoped production bearer during update', async () => {
  await AsyncStorage.__reset();
  // secure-store-test-setup stores this raw SecureStore key under its mock
  // prefix. It represents a bearer written by the historic production app.
  await AsyncStorage.setItem('__secure__:ur_reg_token', 'synthetic-production-bearer');
  await AsyncStorage.setItem('ur_reg_token', 'synthetic-production-async-bearer');

  assert.equal(await storage.get('ur_reg_token'), null);
  await storage.remove('ur_reg_token');
  assert.equal(await AsyncStorage.getItem('__secure__:ur_reg_token'), 'synthetic-production-bearer');
  assert.equal(await AsyncStorage.getItem('ur_reg_token'), 'synthetic-production-async-bearer');

  await storage.set('ur_reg_token', 'synthetic-qa2-bearer');
  assert.equal(await storage.get('ur_reg_token'), 'synthetic-qa2-bearer');
  assert.equal(await AsyncStorage.getItem('__secure__:ur_reg_token'), 'synthetic-production-bearer');
});
