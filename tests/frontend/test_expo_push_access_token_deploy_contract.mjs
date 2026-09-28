import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Hardening A keeps the trigger-only policy in secure-production-deploy.yml;
// the executable production environment and secret handling live in the one
// reusable executor shared by normal and break-glass callers.
const deploy = fs.readFileSync('.github/workflows/production-deploy-execute.yml', 'utf8');
const bootstrap = fs.readFileSync('scripts/remote_bootstrap_secure_env.sh', 'utf8');
const sender = fs.readFileSync('backend/services/push_sender.py', 'utf8');

test('production deploy executor does not pass a legacy Expo push credential', () => {
  assert.doesNotMatch(deploy, /EXPO_ACCESS_TOKEN|EXPO_TOKEN/);
});

test('remote backend bootstrap has no legacy Expo push credential path', () => {
  assert.doesNotMatch(bootstrap, /EXPO_ACCESS_TOKEN|EXPO_TOKEN|incoming_expo/);
});

test('push sender exposes native gateway diagnostics', () => {
  assert.match(sender, /push_gateway\.info\(\)/);
  assert.doesNotMatch(sender, /EXPO_ACCESS_TOKEN|EXPO_TOKEN/);
});
