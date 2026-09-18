import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeDisplayName } from '../../src/utils/displayName.js';

test('guest fixture IDs are never displayed as profile names', () => {
  const guest = 'guest_qa_20260912';
  assert.equal(sanitizeDisplayName(guest, 'Добавьте имя'), 'Добавьте имя');
  assert.equal(sanitizeDisplayName('Serik B.', 'Добавьте имя'), 'Serik B.');
  assert.match(fs.readFileSync('src/screens/ProfileScreen.js', 'utf8'), /sanitizeDisplayName/);
  assert.match(fs.readFileSync('src/screens/EditProfileScreen.js', 'utf8'), /sanitizeDisplayName/);
});
