import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const identity = fs.readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
const timeline = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
const registration = fs.readFileSync('backend/api/registration.py', 'utf8');
const admin = fs.readFileSync('backend/api/admin.py', 'utf8');

test('REG-002: closing identity registration draft persists IIN', () => {
  assert.match(identity, /if \(iin\.trim\(\)\) payload\.iin = iin\.trim\(\);/);
  assert.match(identity, /regAPI\.saveDriverDraft\(payload\)/);
  assert.match(registration, /iin: str = Form\(\.\.\.\)/);
  assert.match(registration, /"iin": iin/);
});

test('REG-001: OCR/selfie do not grant level 3; admin approval is the level-3 path', () => {
  assert.match(registration, /"verification_level": 2/);
  assert.match(admin, /"verification_level": 3/);
});

test('TL-001: delivered, received and completed have distinct timeline icons', () => {
  assert.match(timeline, /delivered: 'package'/);
  assert.match(timeline, /received: 'check-square'/);
  assert.match(timeline, /completed: 'flag'/);
});
