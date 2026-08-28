import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync('.github/workflows/secure-production-deploy.yml', 'utf8');
const bootstrap = fs.readFileSync('scripts/remote_bootstrap_secure_env.sh', 'utf8');
const sender = fs.readFileSync('backend/services/push_sender.py', 'utf8');

test('secure production deploy passes Expo push access token to backend env', () => {
  assert.match(deploy, /EXPO_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.EXPO_ACCESS_TOKEN\s*\|\|\s*secrets\.EXPO_TOKEN\s*\}\}/);
  assert.match(deploy, /printf 'EXPO_ACCESS_TOKEN=%s\\n' "\$EXPO_ACCESS_TOKEN"/);
});

test('remote backend bootstrap preserves Expo push access token without printing it', () => {
  assert.match(bootstrap, /incoming_expo_access_token="\$\(get_env EXPO_ACCESS_TOKEN "\$REMOTE_BOOTSTRAP"\)"/);
  assert.match(bootstrap, /set_env EXPO_ACCESS_TOKEN "\$incoming_expo_access_token"/);
  assert.match(bootstrap, /EXPO_ACCESS_TOKEN_PRESENT=yes/);
  assert.doesNotMatch(bootstrap, /echo .*\$EXPO_ACCESS_TOKEN/);
});

test('push diagnostics expose only whether Expo access token is configured', () => {
  assert.match(sender, /EXPO_TOKEN = os\.getenv\("EXPO_ACCESS_TOKEN", ""\)/);
  assert.match(sender, /"access_token_set": bool\(EXPO_TOKEN\)/);
});
