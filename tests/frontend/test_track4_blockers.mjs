import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('registration Next persists IIN and live submit is pending-only', () => {
  const identity = fs.readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
  const submit = fs.readFileSync('backend/api/driver_registration.py', 'utf8');
  assert.match(identity, /birth_date: birthDate\.trim\(\),\s*iin: iin\.trim\(\),/);
  assert.match(submit, /else "pending"/);
  assert.match(submit, /"verification_level": 3 if existing_approved/);
});

test('GPS start-trip has explicit provider/no-fix health states', () => {
  const gps = fs.readFileSync('src/utils/backgroundLocation.js', 'utf8');
  const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(gps, /getProviderStatusAsync/);
  assert.match(gps, /state: 'system_disabled'/);
  assert.match(gps, /state: 'no_fix'/);
  assert.match(workspace, /getLocationHealth/);
  assert.match(workspace, /gps_system_disabled/);
});
