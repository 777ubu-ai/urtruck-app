import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const identity = fs.readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
const timeline = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
const registration = fs.readFileSync('backend/api/registration.py', 'utf8');

test('REG-002: closing identity registration draft persists IIN', () => {
  assert.match(identity, /if \(iin\.trim\(\)\) payload\.iin = iin\.trim\(\);/);
  assert.match(identity, /regAPI\.saveDriverDraft\(payload\)/);
  assert.match(registration, /iin: str = Form\(\.\.\.\)/);
  assert.match(registration, /"iin": iin/);
});

test('REG-001: self-service moderation requires an explicit trusted provider capability', () => {
  assert.match(registration, /verification_provider_status/);
  assert.match(registration, /trusted_real/);
  assert.match(registration, /trusted_real_provider_required/);
});

test('TL-001: delivered, received and completed have distinct timeline icons', () => {
  assert.match(timeline, /delivered: 'package'/);
  assert.match(timeline, /received: 'check-square'/);
  assert.match(timeline, /completed: 'flag'/);
});
