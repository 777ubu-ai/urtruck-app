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
const otpV2 = read('src/screens/onboarding/OtpV2Screen.js');
const registrationBackend = read('backend/api/registration.py');
const regDal = read('backend/database/registration_dal.py');
const supabaseClient = read('src/config/supabase.js');
const appConfig = JSON.parse(read('app.json'));


test('auth entry exposes Google + Email while Apple is hidden for build 18', () => {
  assert.match(phoneV2, /testID="auth-google"/);
  assert.match(phoneV2, /const SHOW_APPLE_AUTH = false/);
  assert.match(phoneV2, /SHOW_APPLE_AUTH \? <SocialButton provider="apple"/);
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


test('social OAuth fails closed until Supabase confirms provider readiness', () => {
  assert.match(socialAuth, /\/auth\/v1\/settings/);
  assert.match(socialAuth, /settings\?\.external\?\.google === true/);
  assert.match(socialAuth, /settings\?\.external\?\.apple === true/);
  assert.match(socialAuth, /social_provider_unavailable/);
  assert.match(supabaseClient, /export const SUPABASE_URL/);
  assert.match(supabaseClient, /export const SUPABASE_ANON_KEY/);
});


test('Apple Sign In is not active in the current product build', () => {
  assert.equal(appConfig?.expo?.ios?.bundleIdentifier, 'com.urtruck.app');
  assert.equal(appConfig?.expo?.ios?.usesAppleSignIn, undefined);
  assert.doesNotMatch(read('ios/UrTruck/UrTruck.entitlements'), /com\.apple\.developer\.applesignin/);
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


test('phone and company remain required logistics contacts after email/social signup', () => {
  assert.match(profileV2, /id="phone"/);
  assert.match(profileV2, /id="company"/);
  assert.match(profileV2, /const validPhone = isRealPhone\(phone\)/);
  assert.match(profileV2, /const validCompany = company\.trim\(\)\.length >= 2/);
  assert.match(profileV2, /const formValid = validName && validPhone && validCompany && validMessenger/);
  assert.match(profileV2, /if \(!validPhone\) next\.phone/);
  assert.match(profileV2, /if \(!validCompany\) next\.company/);
  // The new canonical flow requires a real phone for every role, not only
  // conditionally for one signup method.
  assert.doesNotMatch(profileV2, /isEmailSignup/);
});


// ─── P0 auth-fix 25.08.2026: real owner repro (Apple provider_unavailable
// mislabeled as "Нет связи с сервером"; Google callback silently dropping
// the user back on the Auth screen) ─────────────────────────────────────

test('P0-B: provider_unavailable/config errors are a distinct code from network failure', () => {
  assert.match(socialAuth, /NETWORK_UNAVAILABLE/);
  assert.match(socialAuth, /PROVIDER_UNAVAILABLE/);
  assert.match(socialAuth, /PROVIDER_CONFIG_INVALID/);
  assert.match(socialAuth, /class SocialAuthError extends Error/);
  // The exact bug: getSocialProviderAvailability distinguishes "could not
  // reach Supabase" (checked:false) from "Supabase confirms disabled"
  // (checked:true, provider:false) — startSocialAuth must branch on both.
  assert.match(socialAuth, /if \(!availability\.checked\)/);
  assert.match(socialAuth, /if \(availability\[provider\] !== true\)/);
});

test('P0-B: PhoneV2Screen maps SocialAuthError codes to distinct copy, never one generic message', () => {
  assert.match(phoneV2, /socialErrorKey/);
  assert.match(phoneV2, /AUTH_ERROR_CODES\.PROVIDER_UNAVAILABLE/);
  assert.match(phoneV2, /AUTH_ERROR_CODES\.NETWORK_UNAVAILABLE/);
  assert.match(phoneV2, /auth_error_provider_unavailable_apple/);
  assert.match(phoneV2, /auth_error_provider_unavailable_google/);
  assert.match(phoneV2, /auth_error_network/);
});

test('P1-C: social error state is independent from email error state', () => {
  assert.match(phoneV2, /\[emailError, setEmailError\]/);
  assert.match(phoneV2, /\[socialError, setSocialError\]/);
  // Email input row must react only to emailError, never socialError.
  assert.match(phoneV2, /s\.inputRow, emailError && s\.inputError/);
  assert.doesNotMatch(phoneV2, /s\.inputRow,\s*(?:error|socialError)\s*&&\s*s\.inputError/);
  // Social error text renders near the provider buttons, not the email row.
  const socialBlockIdx = phoneV2.indexOf('testID="auth-social-error"');
  const emailInputIdx = phoneV2.indexOf('testID="email-v2-input"');
  assert.ok(socialBlockIdx > 0 && socialBlockIdx < emailInputIdx,
    'social error block must render before the email input, not inside it');
});

test('P1-D: only the actively-pressed provider button shows a spinner', () => {
  // Old bug: `socialBusy === provider || socialBusy === 'callback'` lit up
  // BOTH Google and Apple during callback processing regardless of which
  // one the user pressed.
  assert.doesNotMatch(phoneV2, /socialBusy === 'callback'/);
  assert.match(phoneV2, /const loading = socialBusy === provider;/);
  // Pending provider survives the full-page web reload OAuth does.
  assert.match(socialAuth, /PENDING_PROVIDER_KEY/);
  assert.match(socialAuth, /export async function setPendingProvider/);
  assert.match(socialAuth, /export async function getPendingProvider/);
  assert.match(phoneV2, /getPendingProvider\(\)/);
});

test('P0-A: callback success path always resolves role and completes navigation before touching UI state', () => {
  assert.match(phoneV2, /logAuthStage\('role_resolved'/);
  assert.match(phoneV2, /logAuthStage\('navigation_complete'/);
  // A failed backend verify (no token/email in response) must throw a typed
  // error, not silently fall through to goAfterLogin with garbage data.
  assert.match(phoneV2, /AUTH_ERROR_CODES\.BACKEND_VERIFY_FAILED,\s*'social_auth_failed'/);
});

test('P0-A: duplicate callback delivery is idempotent, not a fresh OAuth error', () => {
  // The PKCE code is single-use; processing the SAME callback URL twice
  // (StrictMode double-effect, a stale getInitialURL() resolving late) must
  // no-op ONLY once the full chain already succeeded — NOT right after the
  // Supabase exchange, or a transient backend-verify failure would
  // permanently strand the user (owner review round 2, 25.08.2026: see
  // test_social_auth_retry.mjs for the live behavioral proof).
  assert.match(socialAuth, /exchangedCallbackKey/);
  assert.match(socialAuth, /completedCallbackKey/);
  assert.match(socialAuth, /if \(key && key === completedCallbackKey\)/);
  // The completed mark must be set AFTER urtruck_session_saved, not before
  // backend verify — otherwise a duplicate check at the top would wrongly
  // no-op a retry of a failed verify.
  const completedIdx = socialAuth.indexOf('completedCallbackKey = key');
  const savedLogIdx = socialAuth.indexOf("logAuthStage('urtruck_session_saved'");
  assert.ok(completedIdx > savedLogIdx && savedLogIdx > 0,
    'completedCallbackKey must be set strictly after urtruck_session_saved');
  assert.match(phoneV2, /Duplicate delivery of an already-processed callback/);
});

test('P0-A round 2: a failed backend verify does not permanently strand a retry', () => {
  // sessionFromCallback must accept the callback key and reuse the
  // already-exchanged Supabase session on retry, instead of re-consuming
  // the one-shot PKCE code (which would fail with "invalid grant").
  assert.match(socialAuth, /if \(key && key === exchangedCallbackKey\)/);
  assert.match(socialAuth, /supabase\.auth\.getSession\(\)/);
  // exchangedCallbackKey must be set on BOTH the token and code exchange
  // branches, so either OAuth flavor is retry-safe.
  const exchangeAssignments = (socialAuth.match(/exchangedCallbackKey = key/g) || []).length;
  assert.ok(exchangeAssignments >= 2, `expected exchangedCallbackKey set on both session branches, found ${exchangeAssignments}`);
});

test('diagnostic AUTH_SOCIAL_STAGE instrumentation covers the full chain (no PII/tokens)', () => {
  for (const stage of [
    'provider_callback_received',
    'supabase_session_ready',
    'backend_verify_start',
    'backend_verify_success',
    'urtruck_session_saved',
  ]) {
    assert.ok(socialAuth.includes(`logAuthStage('${stage}'`), `missing stage: ${stage}`);
  }
  // Never allow a raw token/header into the diagnostic logger's payload.
  assert.doesNotMatch(socialAuth, /logAuthStage\([^)]*access_token[^)]*\)/);
  assert.doesNotMatch(socialAuth, /logAuthStage\([^)]*refresh_token[^)]*\)/);
});

test('i18n: social auth error copy exists symmetrically in all 4 languages', () => {
  const i18n = read('src/utils/i18n.js');
  const keys = [
    'auth_error_network',
    'auth_error_provider_unavailable_google',
    'auth_error_provider_unavailable_apple',
    'auth_error_oauth_cancelled',
    'auth_error_callback_failed',
    'auth_error_backend_verify_failed',
    'auth_error_ambiguous_email',
  ];
  for (const lang of ['RU', 'KK', 'ZH', 'EN']) {
    const blockMatch = new RegExp(`\\n  ${lang}: \\{[\\s\\S]*?\\n\\},\\n\\};`, 'm').test(i18n)
      ? new RegExp(`\\n  ${lang}: \\{[\\s\\S]*?(?=\\n  [A-Z]{2}: \\{|\\n\\};)`, 'm').exec(i18n)
      : null;
    assert.ok(blockMatch, `i18n block ${lang} not found`);
    const block = blockMatch[0];
    for (const key of keys) {
      assert.match(block, new RegExp(`${key}:\\s*'`), `${lang} missing key ${key}`);
    }
  }
});

// ─── Round 4 (25.08.2026): AMBIGUOUS_EMAIL_IDENTITY is a stable machine-
// readable contract on both auth endpoints — no hardcoded Russian sentence
// may reach a ZH/EN/KK client. ────────────────────────────────────────

test('backend sends a structured machine code for ambiguous email identity, never a raw Russian sentence, on BOTH auth endpoints', () => {
  for (const [name, src] of [
    ['social_auth.py', socialBackend],
    ['registration.py', registrationBackend],
  ]) {
    const block = src.split('except reg_dal.AmbiguousEmailIdentityError:')[1]?.split(/\n\s*(?:if|@|def)\s/)[0] || '';
    assert.match(block, /"error":\s*"AMBIGUOUS_EMAIL_IDENTITY"/,
      `${name}: ambiguous-identity handler must send a structured error code`);
    assert.doesNotMatch(block, /detail=["'][^"']*[А-Яа-яЁё]/,
      `${name}: detail must not be a raw Cyrillic string — the UI owns localized copy`);
  }
});

test('AmbiguousEmailIdentityError carries a machine-readable shape (normalized_email + count), not just a message string', () => {
  assert.match(regDal, /class AmbiguousEmailIdentityError\(Exception\)/);
  assert.match(regDal, /self\.normalized_email = normalized_email/);
  assert.match(regDal, /self\.count = count/);
});

test('frontend maps AMBIGUOUS_EMAIL_IDENTITY to its own error code and localized copy, not the generic backend-verify bucket', () => {
  assert.match(socialAuth, /AMBIGUOUS_EMAIL_IDENTITY:\s*'AMBIGUOUS_EMAIL_IDENTITY'/);
  // completeSocialAuth must actually read the backend's machine code from
  // detail.error and re-throw it as its own SocialAuthError code, not
  // silently fold it into BACKEND_VERIFY_FAILED.
  assert.match(socialAuth, /data\?\.detail\?\.error/);
  assert.match(socialAuth, /AUTH_ERROR_CODES\[machineCode\]/);
  assert.match(phoneV2, /AUTH_ERROR_CODES\.AMBIGUOUS_EMAIL_IDENTITY/);
  assert.match(phoneV2, /auth_error_ambiguous_email/);
});

test('email-OTP verify path (OtpV2Screen) also detects the machine code instead of showing "wrong code" for a correct-code identity conflict', () => {
  // A CORRECT OTP code that hits an ambiguous-identity conflict is not a
  // wrong-code error — showing otp_v2_wrong here would tell a user with
  // the right code to keep retyping it forever.
  assert.match(otpV2, /r\.detail\?\.error === 'AMBIGUOUS_EMAIL_IDENTITY'/);
  assert.match(otpV2, /auth_error_ambiguous_email/);
  // That branch must come before the generic wrong-code fallback so it is
  // actually reachable.
  const notTokenIdx = otpV2.indexOf('if (!r.token)');
  const ambiguousIdx = otpV2.indexOf("AMBIGUOUS_EMAIL_IDENTITY");
  const genericWrongIdx = otpV2.indexOf("t('otp_v2_wrong')", ambiguousIdx);
  assert.ok(notTokenIdx >= 0 && ambiguousIdx > notTokenIdx && genericWrongIdx > ambiguousIdx,
    'ambiguous-identity check must be inside the !r.token branch and precede the generic wrong-code fallback');
});
