import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

test('Android removes the duplicate Firebase base messaging service', () => {
  assert.match(
    manifest,
    /<service\s+android:name="com\.google\.firebase\.messaging\.FirebaseMessagingService"\s+tools:node="remove"\s*\/>/,
  );
  assert.match(manifest, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
});
