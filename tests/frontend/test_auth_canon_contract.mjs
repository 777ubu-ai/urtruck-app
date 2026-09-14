import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// FINAL 10/10 audit — AUTH CANON contract.
//
// 2026-09-14: owner decision closed the fork this file used to only
// characterize. There is now exactly ONE canonical entry — PhoneV2
// (AuthV2) — and every real guest-conversion path leads there. This file
// now has three jobs:
//
//   1. INVARIANTS — backend social-auth security boundary. Unchanged by the
//      canon decision; still real regression guards.
//
//   2. CLOSURE — positive assertions that the ONE canonical entry is wired
//      correctly (VerificationGate, the one direct-navigate bypass fixed
//      alongside it, phone as a first-class AuthV2 method, explicit Apple
//      platform/config gating instead of a bare hidden flag).
//
//   3. REACHABILITY SWEEP — "ни один normal product gate не навигирует
//      напрямую в legacy Reg" as a standing, repo-wide guarantee, not a
//      one-time read: every screen/component file OUTSIDE the internal
//      AuthV2 phone-flow implementation itself is scanned for a direct
//      navigate() into a legacy route. A new bypass anywhere in the tree
//      fails this test, not just the handful of files read explicitly
//      above.

const navigator = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const gate = readFileSync('src/components/VerificationGate.js', 'utf8');
const phoneV2 = readFileSync('src/screens/onboarding/PhoneV2Screen.js', 'utf8');
const legacyRegister = readFileSync('src/screens/registration/PremiumRegisterScreen.js', 'utf8');
const legacyLogin = readFileSync('src/screens/registration/PremiumLoginScreen.js', 'utf8');
const legacyOtp = readFileSync('src/screens/registration/PremiumOtpScreen.js', 'utf8');
const myTrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const socialAuth = readFileSync('backend/api/social_auth.py', 'utf8');
const socialAuthJs = readFileSync('src/utils/socialAuth.js', 'utf8');

// ── 1. INVARIANTS — backend social-auth security boundary ────────────────
// These are fork-independent: whichever screen is canonical, Google/Apple
// identity proof must stay server-validated.

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

// ── 2. CLOSURE — the ONE canonical entry, positively asserted ────────────

test('CLOSURE: VerificationGate always routes to PhoneV2, never legacy Role/Reg', () => {
  assert.match(gate, /navigation\.navigate\('PhoneV2'/);
  assert.doesNotMatch(gate, /navigation\.navigate\('Role'/);
  assert.doesNotMatch(gate, /navigation\.navigate\('Reg'/);
  // The old two-branch pickTarget(currentLevel, requiredLevel) helper that
  // produced the divergence is gone, not just unused.
  assert.doesNotMatch(gate, /function pickTarget/);
});

test('CLOSURE: MyTripsScreen\'s own direct gate bypass also routes to PhoneV2', () => {
  assert.doesNotMatch(myTrips, /navigation\.navigate\('Role'\)/);
  assert.match(myTrips, /navigation\.navigate\('PhoneV2'/);
});

test('CLOSURE: PhoneV2 exposes phone as a first-class AuthV2 method', () => {
  assert.match(phoneV2, /the ONE canonical sign-in \/ registration entry/);
  assert.match(phoneV2, /testID="phone-v2-continue-with-phone"/);
  assert.match(phoneV2, /navigation\.navigate\('Login'/);
  // The old exclusionary product rule is gone from the header.
  assert.doesNotMatch(phoneV2, /Phone is NOT an authentication tab anymore/);
});

test('CLOSURE: Apple availability is an explicit platform/config gate, not a bare flag', () => {
  assert.doesNotMatch(phoneV2, /const SHOW_APPLE_AUTH/);
  assert.match(phoneV2, /getAppleAuthGate/);
  assert.match(phoneV2, /appleGate\.show/);
  // Every resolution path is a named reason, not a silent boolean.
  assert.match(socialAuthJs, /PLATFORM_NOT_IOS/);
  assert.match(socialAuthJs, /PROVIDER_UNAVAILABLE/);
  assert.match(socialAuthJs, /CHECK_UNREACHABLE/);
  assert.match(socialAuthJs, /Platform\.OS !== 'ios'/);
});

test('CLOSURE: the internal phone flow hands a role-less user to canonical RoleV2, not legacy Role', () => {
  // PremiumOtpScreen's login-mode, no-role branch used to reset into
  // legacy 'Role'. It must now match every other AuthV2 method.
  assert.doesNotMatch(legacyOtp, /routes: \[\{ name: 'Role' \}\]/);
  assert.match(legacyOtp, /routes: \[\{ name: 'RoleV2'/);
});

test('CLOSURE: PremiumLoginScreen\'s "no account" link returns to AuthV2, not legacy Role', () => {
  assert.doesNotMatch(legacyLogin, /navigation\.navigate\('Role'\)/);
  assert.match(legacyLogin, /navigation\.navigate\('PhoneV2'\)/);
});

test('CLOSURE: legacy Premium screens remain registered (internal AuthV2 implementation / qaPreview), not deleted', () => {
  // §8 of the closure brief: internal canonical phone flow and qaPreview
  // backward-compat are explicitly ALLOWED — only direct product-screen
  // navigation into them is forbidden (checked by the sweep below).
  assert.match(navigator, /<Stack\.Screen name="Login" component=\{PremiumLoginScreen\}/);
  assert.match(navigator, /<Stack\.Screen name="Reg" component=\{PremiumRegisterScreen\}/);
  assert.match(legacyRegister, /НЕТ Apple\/Google/);
});

// ── 3. REACHABILITY SWEEP — repo-wide, not just the files read above ─────
// "ни один normal product gate не навигирует напрямую в legacy Reg" as a
// standing guarantee. A NEW bypass introduced anywhere in src/screens or
// src/components fails this test, not just the specific files this audit
// already found and fixed.

const LEGACY_TARGETS = /navigate\(\s*['"](Role|Reg|RegOtp|RegProfile|Auth)['"]/;

// Internal-implementation exemptions, matching §8 of the closure brief
// exactly: the phone flow's OWN screens (they legitimately navigate each
// other — send → OtpV2/RegOtp, complete → RegProfile), the orphaned legacy
// chooser itself (RoleScreen.js, reachable only from qaPreview + its own
// try/catch fallback if navigate('PhoneV2') itself throws), and the
// qaPreview gallery (DesignPreviewScreen.js, explicitly allowed as QA
// preview, per §8).
const EXEMPT_FILES = new Set([
  path.normalize('src/screens/RoleScreen.js'),
  path.normalize('src/screens/DesignPreviewScreen.js'),
]);
const EXEMPT_DIR = path.normalize('src/screens/registration') + path.sep;

function listJsFiles(root) {
  const out = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const rel = path.join(path.relative('.', entry.parentPath ?? entry.path), entry.name);
      out.push(rel);
    }
  }
  return out;
}

test('REACHABILITY SWEEP: no product screen/component navigates directly into legacy Role/Reg/Auth', () => {
  const roots = ['src/screens', 'src/components'];
  const offenders = [];
  for (const root of roots) {
    for (const file of listJsFiles(root)) {
      const norm = path.normalize(file);
      if (EXEMPT_FILES.has(norm)) continue;
      if (norm.startsWith(EXEMPT_DIR)) continue;
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (LEGACY_TARGETS.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
  assert.deepEqual(offenders, [], `direct navigation into legacy auth routes found:\n${offenders.join('\n')}`);
});

test('REACHABILITY SWEEP: the sweep itself is not vacuous (it does scan a non-trivial number of files)', () => {
  // Guards against the sweep test silently scanning zero files after a
  // future directory rename — deepEqual([], []) would pass even then.
  const total = ['src/screens', 'src/components']
    .flatMap((root) => listJsFiles(root))
    .filter((f) => {
      const norm = path.normalize(f);
      return !EXEMPT_FILES.has(norm) && !norm.startsWith(EXEMPT_DIR);
    }).length;
  assert.ok(total > 50, `expected the sweep to cover well over 50 files, got ${total}`);
});
