import assert from 'node:assert/strict';
import { migrateLegacyValue } from '../../src/utils/storage.js';

let removed;

removed = false;
const migrated = await migrateLegacyValue({
  value: 'opaque-session-token',
  setSecure: async (value) => assert.equal(value, 'opaque-session-token'),
  removeLegacy: async () => { removed = true; },
});
assert.equal(migrated, true);
assert.equal(removed, true, 'legacy value is removed after secure write');

removed = false;
const retained = await migrateLegacyValue({
  value: 'opaque-session-token',
  setSecure: async () => { throw new Error('keystore unavailable'); },
  removeLegacy: async () => { removed = true; },
});
assert.equal(retained, false);
assert.equal(removed, false, 'legacy value remains when secure write fails');

console.log('secure storage migration: PASS');
