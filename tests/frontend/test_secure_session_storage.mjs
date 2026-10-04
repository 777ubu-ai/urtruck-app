import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

function secureDouble() {
  const values = new Map();
  return {
    values,
    failGet: null,
    failSet: null,
    failDelete: null,
    async getItemAsync(key) {
      if (this.failGet) throw this.failGet;
      return values.has(key) ? values.get(key) : null;
    },
    async setItemAsync(key, value) {
      if (this.failSet) throw this.failSet;
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      if (this.failDelete) throw this.failDelete;
      values.delete(key);
    },
  };
}

async function freshStorage(secure) {
  Platform.OS = 'android';
  const previousRequire = globalThis.require;
  globalThis.require = (specifier) => {
    if (specifier === 'expo-secure-store') return secure;
    if (typeof previousRequire === 'function') return previousRequire(specifier);
    throw new Error(`Unmocked native module: ${specifier}`);
  };
  const module = await import(`../../src/utils/storage.js?secure-session=${Date.now()}-${Math.random()}`);
  return { storage: module.storage, restore: () => { globalThis.require = previousRequire; } };
}

async function reset() {
  await AsyncStorage.__reset();
}

test('legacy token survives a failed SecureStore migration', async () => {
  await reset();
  const secure = secureDouble();
  secure.failSet = new Error('simulated secure write failure');
  await AsyncStorage.setItem('ur_reg_token', 'synthetic-legacy-token');
  const harness = await freshStorage(secure);
  try {
    await assert.rejects(
      harness.storage.get('ur_reg_token'),
      (error) => error?.code === 'SECURE_MIGRATION_WRITE_FAILED',
    );
    assert.equal(await AsyncStorage.getItem('ur_reg_token'), 'synthetic-legacy-token');
    assert.equal(secure.values.size, 0);
  } finally { harness.restore(); }
});

test('failed replacement cannot claim B while an older secure A remains authoritative', async () => {
  await reset();
  const secure = secureDouble();
  const harness = await freshStorage(secure);
  try {
    await harness.storage.set('ur_reg_token', 'synthetic-token-A');
    secure.failSet = new Error('simulated secure write failure');
    await assert.rejects(
      harness.storage.set('ur_reg_token', 'synthetic-token-B'),
      (error) => error?.code === 'SECURE_WRITE_FAILED',
    );
    secure.failSet = null;
    assert.equal(await harness.storage.get('ur_reg_token'), 'synthetic-token-A');
    assert.equal(await AsyncStorage.getItem('ur_reg_token'), null);
  } finally { harness.restore(); }
});

test('a verified B survives cold restart and is the only readable session', async () => {
  await reset();
  const secure = secureDouble();
  const first = await freshStorage(secure);
  try {
    await first.storage.set('ur_reg_token', 'synthetic-token-B');
  } finally { first.restore(); }

  const restarted = await freshStorage(secure);
  try {
    assert.equal(await restarted.storage.get('ur_reg_token'), 'synthetic-token-B');
    assert.equal(await AsyncStorage.getItem('ur_reg_token'), null);
  } finally { restarted.restore(); }
});

test('temporary SecureStore read failure is explicit and does not erase a session', async () => {
  await reset();
  const secure = secureDouble();
  const harness = await freshStorage(secure);
  try {
    await harness.storage.set('ur_reg_token', 'synthetic-token-A');
    secure.failGet = new Error('temporarily locked');
    await assert.rejects(
      harness.storage.get('ur_reg_token'),
      (error) => error?.code === 'SECURE_READ_FAILED',
    );
    secure.failGet = null;
    assert.equal(await harness.storage.get('ur_reg_token'), 'synthetic-token-A');
  } finally { harness.restore(); }
});

test('failed SecureStore deletion is explicit and leaves the current session readable', async () => {
  await reset();
  const secure = secureDouble();
  const harness = await freshStorage(secure);
  try {
    await harness.storage.set('ur_reg_token', 'synthetic-token-A');
    secure.failDelete = new Error('temporarily locked');
    await assert.rejects(
      harness.storage.remove('ur_reg_token'),
      (error) => error?.code === 'SECURE_DELETE_FAILED',
    );
    secure.failDelete = null;
    assert.equal(await harness.storage.get('ur_reg_token'), 'synthetic-token-A');
  } finally { harness.restore(); }
});

test('AuthContext guards against late session restoration and failed token deletion', () => {
  const source = readFileSync('src/utils/AuthContext.js', 'utf8');
  assert.match(source, /const authEpoch = useRef\(0\)/);
  assert.match(source, /epoch !== authEpoch\.current/);
  assert.match(source, /await regAPI\.clearToken\(\)/);
  assert.match(source, /reason: 'SECURE_DELETE_FAILED'/);
});

test('sensitive storage does not log bearer values', () => {
  const source = readFileSync('src/utils/storage.js', 'utf8');
  assert.doesNotMatch(source, /console\.(log|warn|error).*value/);
});
