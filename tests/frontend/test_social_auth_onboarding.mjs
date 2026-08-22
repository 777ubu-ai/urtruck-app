import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const phoneV2 = read('src/screens/onboarding/PhoneV2Screen.js');
const onboardingV2 = read('src/screens/onboarding/OnboardingV2Screen.js');
const socialAuth = read('src/utils/socialAuth.js');
const socialBackend = read('backend/api/social_auth.py');
const backendMain = read('backend/main.py');
const profileV2 = read('src/screens/onboarding/ProfileV2Screen.js');
const supabaseClient = read('src/config/supabase.js');


test('auth entry exposes Google + Apple + Email and no phone auth tab', () => {
  assert.match(phoneV2, /testID="auth-google"/);
  assert.match(phoneV2, /testID="auth-apple"/);
  assert.match(phoneV2, /testID="email-v2-input"/);
  assert.doesNotMatch(phoneV2, /testID="auth-tab-phone"/);
  assert.doesNotMatch(phoneV2, /DEFAULT_COUNTRY/);
  assert.doesNotMatch(phoneV2, /sendCode\(/);
  assert.doesNotMatch(phoneV2, /CountryPicker/);
});


test('keyboard-safe layout keeps legal consent inside the scrollable content', () => {
  const scrollStart = phoneV2.indexOf('<ScrollView');
  const legal = phoneV2.indexOf('testID="auth-legal-consent"');
  const scrollEnd = phoneV2.indexOf('</ScrollView>', legal);
  assert.ok(scrollStart >= 0, 'ScrollView must exist');
  assert.ok(legal > scrollStart, 'legal block must be inside ScrollView');
  assert.ok(scrollEnd > legal, 'ScrollView must close after legal block');
  assert.match(phoneV2, /keyboardShouldPersistTaps="handled"/);
  assert.match(phoneV2, /flexGrow:\s*1/);
});


test('social OAuth supports only Google/Apple and returns through UrTruck deep link', () => {
  assert.match(socialAuth, /\['google', 'apple'\]/);
  assert.match(socialAuth, /urtruck:\/\/auth-social/);
  assert.match(socialAuth, /signInWithOAuth/);
  assert.match(socialAuth, /register\/social\/verify/);
  assert.match(socialAuth, /consent:\s*true/);
});


test('cold-start and full-page OAuth callbacks are routed back into the auth screen', () => {
  assert.match(onboardingV2, /isSocialAuthCallback/);
  assert.match(onboardingV2, /Linking\.getInitialURL\(\)/);
  assert.match(onboardingV2, /navigation\.navigate\('PhoneV2', \{ socialAuthUrl: url \}\)/);
  assert.match(phoneV2, /route\?\.params\?\.socialAuthUrl/);
  assert.match(phoneV2, /finishSocialUrl\(routedSocialUrl\)/);
});


test('backend validates Supabase identity before issuing UrTruck session', () => {
  assert.match(socialBackend, /\/auth\/v1\/user/);
  assert.match(socialBackend, /_ALLOWED_PROVIDERS\s*=\s*\{"google", "apple"\}/);
  assert.match(socialBackend, /reg_dal\.create_session/);
  assert.match(socialBackend, /if not req\.consent/);
  assert.match(backendMain, /social_auth_router/);
  assert.match(backendMain, /\/api\/v1\/register\/social/);
});


test('backend social validation uses the same live Supabase project/key family as client', () => {
  assert.match(socialBackend, /pymddxenwtjcbmrafvnc\.supabase\.co/);
  assert.match(socialBackend, /SUPABASE_AUTH_ANON_KEY/);
  assert.match(supabaseClient, /pymddxenwtjcbmrafvnc\.supabase\.co/);
  assert.match(supabaseClient, /SUPABASE_ANON_KEY/);
});


test('phone remains a required logistics contact after email/social signup', () => {
  assert.match(profileV2, /isEmailSignup\s*=\s*\/@\//);
  assert.match(profileV2, /!validPhone/);
  assert.match(profileV2, /phoneRequiredLabel/);
});
