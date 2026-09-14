import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// FINAL 10/10 audit (2026-09-14) — AUTH CANON contract.
//
// Two contradictory product rules for "how does a user sign in" are
// simultaneously live in this tree. This file does two different jobs:
//
//   1. INVARIANTS — assertions that hold regardless of which auth canon the
//      owner ultimately picks (the backend social-auth security boundary).
//      These are real regression guards.
//
//   2. CHARACTERIZATION — assertions that pin the CURRENT, DIVERGENT routing
//      so it cannot drift further silently while the product fork is open.
//      They are deliberately descriptive, not prescriptive: when the owner
//      resolves AUTH_CANON (see the audit report), the characterization block
//      must be UPDATED ON PURPOSE to describe the chosen canon. A failure
//      there means "someone changed auth routing" — look, decide, re-pin.
//
// Do not "fix" the characterization block by relaxing it. Resolve the fork.

const navigator = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const gate = readFileSync('src/components/VerificationGate.js', 'utf8');
const phoneV2 = readFileSync('src/screens/onboarding/PhoneV2Screen.js', 'utf8');
const legacyRegister = readFileSync('src/screens/registration/PremiumRegisterScreen.js', 'utf8');
const socialAuth = readFileSync('backend/api/social_auth.py', 'utf8');

// ── 1. INVARIANTS — backend social-auth security boundary ────────────────
// These are fork-independent: whichever screen ends up canonical, Google/
// Apple identity proof must stay server-validated.

test('social verify never accepts a client-supplied identity', () => {
  // The request model carries ONLY the provider access token + consent +
  // guest upgrade token. An `email` or `provider` field here would let a
  // caller assert someone else's identity.
  const model = socialAuth.split('class SocialVerifyRequest')[1].split('def ')[0];
  assert.match(model, /access_token:\s*str/);
  assert.doesNotMatch(model, /^\s*email\s*:/m);
  assert.doesNotMatch(model, /^\s*provider\s*:/m);
});

test('social verify validates the provider token server-side', () => {
  assert.match(socialAuth, /auth\/v1\/user/);
  assert.match(socialAuth, /_verified_supabase_identity/);
  // Identity is derived from the VERIFIED response, not from the request.
  assert.match(socialAuth, /email = \(user\.get\("email"\) or ""\)/);
});

test('social verify rejects invalid, expired and non-allowlisted identities', () => {
  assert.match(socialAuth, /response\.status_code in \(401, 403\)/);
  assert.match(socialAuth, /_ALLOWED_PROVIDERS = \{"google", "apple"\}/);
  assert.match(socialAuth, /user\.get\("aud"\) not in \(None, "authenticated"\)/);
});

test('social verify fails closed on ambiguous email identity', () => {
  assert.match(socialAuth, /AmbiguousEmailIdentityError/);
  assert.match(socialAuth, /AMBIGUOUS_EMAIL_IDENTITY/);
  // Stable machine-readable code, not raw Russian prose the UI would render.
  assert.match(socialAuth, /status_code=409/);
});

test('social auth never logs the provider access token', () => {
  const logLines = socialAuth.split('\n').filter((l) => /print\(|logger|logging/.test(l));
  for (const line of logLines) {
    assert.doesNotMatch(line, /access_token|req\.access_token|token=/);
  }
});

// ── 2. CHARACTERIZATION — the currently divergent auth routing ───────────
// UPDATE THESE DELIBERATELY once AUTH_CANON is decided.

test('CHARACTERIZATION: PhoneV2 still declares social+email as the canon', () => {
  assert.match(phoneV2, /canonical sign-in \/ registration entry/);
  assert.match(phoneV2, /Google \+ Apple \+ Email are the only login/);
  assert.match(phoneV2, /Phone is NOT an authentication tab anymore/);
});

test('CHARACTERIZATION: Apple is hidden behind an in-code flag, not a config', () => {
  // Backend already allowlists apple; only this UI constant hides it.
  assert.match(phoneV2, /const SHOW_APPLE_AUTH = false/);
  assert.match(socialAuth, /"apple"/);
});

test('CHARACTERIZATION: legacy phone-only registration is still mounted for guests', () => {
  // The unauthenticated / no-role stack still registers the legacy Premium
  // screens alongside the V2 onboarding ones.
  assert.match(navigator, /<Stack\.Screen name="PhoneV2"/);
  assert.match(navigator, /<Stack\.Screen name="Reg" component=\{PremiumRegisterScreen\}/);
  assert.match(navigator, /<Stack\.Screen name="Login" component=\{PremiumLoginScreen\}/);
  // ...and that legacy screen is explicitly phone+SMS only.
  assert.match(legacyRegister, /НЕТ Apple\/Google/);
});

test('CHARACTERIZATION: the verification gate routes converts into the legacy stack', () => {
  // This is the divergence: every gated action with a role hint sends the
  // user to 'Reg' (legacy phone-only), never to PhoneV2/OnboardingV2.
  assert.match(gate, /const target = inferredRole \? 'Reg' : pickTarget\(/);
  assert.match(gate, /if \(currentLevel < 1\) return 'Role';/);
  assert.doesNotMatch(gate, /PhoneV2/);
});
