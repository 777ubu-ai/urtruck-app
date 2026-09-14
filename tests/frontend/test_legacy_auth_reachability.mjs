// Reachability sweep for §13 (legacy auth screens) and §14 (dead second
// chat list), AGENT D hardening pass (2026-09-14, baseline 27aba818).
//
// Same source-level (gray-box) pattern as
// tests/frontend/test_notification_center_reachability.mjs: read the real
// source, assert the concrete strings that make a route reachable (or
// prove it is not). This file does NOT re-verify things those other tests
// already own (notification bell routing, Deals/legacy chat isolation
// wrapper) — it locks in the specific findings of this pass:
//
//   1. The 'Auth' Stack.Screen was a dead alias of 'Login' (same
//      component, zero navigate('Auth') callers anywhere — not even the
//      qaPreview design gallery). Removed. This test fails loudly if it
//      ever comes back, and fails just as loudly if 'Login' — which IS
//      live — ever gets removed by mistake alongside it.
//   2. RoleScreen ('Role') and PremiumRegisterScreen ('Reg') are NOT dead
//      code, despite an earlier session's notes to the contrary: they are
//      reached in production via VerificationGate.requireLevel() (bid /
//      publish / contact gates on Feed, CargoDetail, TripDetail, DriverDetail,
//      DealsScreen, QueueScreenLazyV2, MyTripsScreen) and via MyTripsScreen's
//      own guest empty-state gate. PremiumOtpScreen ('RegOtp') independently
//      routes an existing-phone-no-role login back to 'Role'. Do not delete
//      Role/Reg/RegOtp/RegProfile/Login without re-running this same sweep.
//   3. The 'ChatsList' route (App.js push-tap deep link for a generic
//      kind==='chat'|'chats' notification with no id) is production-live,
//      not QA-only — confirmed against docs/audit-final-20260908/
//      C5-DEAD-CODE-MANIFEST.md. ChatsListLegacyScreen.js must stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const gate = readFileSync('src/components/VerificationGate.js', 'utf8');
const myTrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const premiumOtp = readFileSync('src/screens/registration/PremiumOtpScreen.js', 'utf8');
const premiumLogin = readFileSync('src/screens/registration/PremiumLoginScreen.js', 'utf8');
const premiumRegister = readFileSync('src/screens/registration/PremiumRegisterScreen.js', 'utf8');
const appRoot = readFileSync('App.js', 'utf8');
const chatsListWrapper = readFileSync('src/screens/ChatsListScreen.js', 'utf8');

test('the dead "Auth" route alias is gone; the live "Login" route is not', () => {
  assert.doesNotMatch(nav, /name="Auth"/, 'Auth was a 0-caller duplicate of Login — must stay removed');
  // Every stack that used to carry 'Auth' still carries 'Login' (the real,
  // reachable route PremiumRegisterScreen's "already have an account" link
  // and RoleScreen's goAuth() target).
  const loginCount = (nav.match(/name="Login"/g) || []).length;
  assert.ok(loginCount >= 2, 'Login must stay registered in both the guest and qaPreview stacks');
});

test('Role/Reg/RegOtp/RegProfile stay registered — they are live, not orphaned', () => {
  for (const name of ['Role', 'Reg', 'RegOtp', 'RegProfile']) {
    assert.match(nav, new RegExp(`name="${name}"`), `${name} route must stay registered`);
  }
});

test('VerificationGate still routes unauthenticated/under-verified users into Role/Reg', () => {
  // pickTarget(currentLevel, requiredLevel): guest (<1) -> Role, phone-only -> Reg.
  assert.match(gate, /function pickTarget\(currentLevel, requiredLevel\)/);
  assert.match(gate, /if \(currentLevel < 1\) return 'Role'/);
  assert.match(gate, /return 'Reg'/);
  // handleProceed() actually calls navigation.navigate with that target —
  // this is what makes the gate a real, live caller and not just an
  // unused helper.
  assert.match(gate, /navigation\.navigate\(target, inferredRole \? \{ role: inferredRole \} : undefined\)/);
  // Consumed by real, mounted screens — not just defined and unused.
  const gateConsumers = [
    'src/screens/CargoDetail.js',
    'src/screens/CargoFeedScreen.js',
    'src/screens/DriverDetail.js',
    'src/screens/DealsScreen.js',
    'src/screens/QueueScreenLazyV2.js',
    'src/screens/TripDetail.js',
    'src/screens/MyTripsScreen.js',
    'src/screens/FeedScreen.js',
  ];
  for (const file of gateConsumers) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /useVerificationGate/, `${file} must still wire the verification gate`);
  }
});

test('MyTripsScreen guest empty-state gate still enters via Role (real entry point)', () => {
  assert.match(myTrips, /data\?\.authRequired/);
  assert.match(myTrips, /onAction=\{\(\) => navigation\.navigate\('Role'\)\}/);
});

test('PremiumOtpScreen still falls an existing no-role phone back to Role', () => {
  assert.match(premiumOtp, /navigation\.reset\(\{ index: 0, routes: \[\{ name: 'Role' \}\] \}\)/);
});

test('PremiumLogin <-> PremiumRegister cross-links stay wired (both reachable, neither orphaned)', () => {
  assert.match(premiumLogin, /navigation\.navigate\('Role'\)/, 'PremiumLoginScreen "no account" link');
  assert.match(premiumRegister, /navigation\.navigate\('Login'\)/, 'PremiumRegisterScreen "already have an account" link');
});

test('ChatsList push-deep-link stays wired in App.js (production-live, not QA-only)', () => {
  // kind==='chat'|'chats' with NO id -> generic chat-activity push, opens
  // the standalone legacy list. Do not collapse this into the 'chats'+id
  // branch above it (that one opens a specific Chat room and is unrelated).
  assert.match(appRoot, /\} else if \(kind === 'chat' \|\| kind === 'chats'\) \{\s*\n\s*navRef\.current\.navigate\('ChatsList'\);/);
  assert.match(nav, /name="ChatsList"/);
});

test('ChatsListScreen keeps Deals isolated from the legacy standalone chat list', () => {
  // Guards the invariant test_deals_whatsapp_floating_header.mjs also
  // checks: route.name==='Deals' is the ONLY way to reach the canonical
  // DealsScreen through this wrapper; every other route name (ChatsList,
  // the push-tap deep link above) still gets the legacy implementation.
  assert.match(chatsListWrapper, /props\?\.route\?\.name === ['"]Deals['"]/);
  assert.match(chatsListWrapper, /<DealsScreen \{\.\.\.props\} ?\/>/);
  assert.match(chatsListWrapper, /<LegacyChatsListScreen \{\.\.\.props\} ?\/>/);
});
