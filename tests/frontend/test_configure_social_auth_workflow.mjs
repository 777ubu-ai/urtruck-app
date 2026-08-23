import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/configure-social-auth.yml'),
  'utf8',
);

test('secure handoff workflow requires mobile-entered secrets and generates Apple JWT only at runtime', () => {
  const required = [
    'SUPABASE_ACCESS_TOKEN',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_SERVICES_ID',
    'APPLE_PRIVATE_KEY_P8',
  ];

  for (const key of required) {
    assert.match(workflow, new RegExp(`\\b${key}\\b`));
  }

  assert.doesNotMatch(workflow, /secrets\.APPLE_CLIENT_SECRET/);
  assert.match(workflow, /Generate Apple client secret in runner memory/);
  assert.match(workflow, /APPLE_CLIENT_SECRET=/);
  assert.match(workflow, /mktemp/);
  assert.match(workflow, /chmod 600/);
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /PyJWT==2\.10\.1/);
  assert.match(workflow, /cryptography==45\.0\.6/);
});

test('secure handoff workflow masks generated Apple JWT before provider configuration', () => {
  const maskIndex = workflow.indexOf('echo "::add-mask::${apple_client_secret}"');
  const configureIndex = workflow.indexOf('Configure providers without exposing secrets');
  assert.ok(maskIndex >= 0, 'generated Apple client secret must be masked');
  assert.ok(configureIndex > maskIndex, 'masking must happen before provider configuration');
});
