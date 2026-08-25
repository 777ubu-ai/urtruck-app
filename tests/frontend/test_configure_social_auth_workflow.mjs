import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/configure-social-auth.yml'),
  'utf8',
);
const providerScript = fs.readFileSync(
  path.join(root, 'scripts/configure_social_auth_providers.sh'),
  'utf8',
);

test('secure handoff workflow keeps protected credential names and generates Apple JWT only at runtime', () => {
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

test('Google configuration is not blocked by missing Apple signing material', () => {
  assert.match(
    workflow,
    /secrets\.GOOGLE_OAUTH_CLIENT_SECRET \|\| secrets\.GOOGLE_CAUTH_CLIENT_SECRET/,
  );
  assert.match(workflow, /APPLE_CONFIG_READY=false/);
  assert.match(workflow, /Configure Google provider without exposing secrets/);
  assert.match(workflow, /SOCIAL_AUTH_MODE: google/);
  assert.match(workflow, /Configure Apple provider without exposing secrets/);
  assert.match(workflow, /if: env\.APPLE_CONFIG_READY == 'true'/);

  const googleConfigureIndex = workflow.indexOf('Configure Google provider without exposing secrets');
  const appleInstallIndex = workflow.indexOf('Install Apple JWT dependencies');
  assert.ok(googleConfigureIndex >= 0, 'Google configuration step must exist');
  assert.ok(appleInstallIndex > googleConfigureIndex, 'Google must configure before optional Apple work');
});

test('live provider verification waits for Supabase auth config convergence', () => {
  assert.match(workflow, /for attempt in \$\(seq 1 12\)/);
  assert.match(workflow, /Google auth settings have not converged yet/);
  assert.match(workflow, /Apple auth settings have not converged yet/);
  assert.match(workflow, /sleep 5/);
  assert.match(workflow, /external\.google == true/);
  assert.match(workflow, /external\.apple == true/);
  assert.match(workflow, /Google OAuth authorize redirect ready/);
  assert.match(workflow, /Apple OAuth authorize redirect ready/);
  assert.match(workflow, /accounts\.google\.com/);
});

test('secure handoff workflow masks generated Apple JWT before Apple provider configuration', () => {
  const maskIndex = workflow.indexOf('echo "::add-mask::${apple_client_secret}"');
  const configureIndex = workflow.indexOf('Configure Apple provider without exposing secrets');
  assert.ok(maskIndex >= 0, 'generated Apple client secret must be masked');
  assert.ok(configureIndex > maskIndex, 'masking must happen before Apple provider configuration');
});

test('provider configuration script supports isolated Google and Apple patches', () => {
  assert.match(providerScript, /MODE="\$\{SOCIAL_AUTH_MODE:-both\}"/);
  assert.match(providerScript, /google\)\n\s+required\+=\(GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET\)/);
  assert.match(providerScript, /apple\)\n\s+required\+=\(APPLE_SERVICES_ID APPLE_CLIENT_SECRET\)/);
  assert.match(providerScript, /external_google_enabled: true/);
  assert.match(providerScript, /external_apple_enabled: true/);
  assert.match(providerScript, /SOCIAL_AUTH_CONFIG=%s-ready/);
});
