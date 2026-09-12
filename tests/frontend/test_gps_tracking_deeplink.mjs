// Track: Claude harness fix, P1 (2026-09-08/09).
//
// Root cause: backend's tracking-request/approved/declined/stopped pushes
// (backend/api/marketplace.py:_tracking_notify, called from the GPS
// consent request/respond/stop endpoints) all set
// url=/deals/{deal_id}?action=tracking — App.js's parseNotifUrl() parsed
// `action` into `params.action` correctly, but navigateFromUrl()'s
// kind==='deals' branch only ever called
// navigate('Chat', { dealId: id, role }), dropping params.action on the
// floor. NotificationsScreen.js has its own, separate copy of the same
// parser with the identical bug for in-app taps.
//
// Fix: thread `action` through App.js and NotificationsScreen.js's
// navigate('Chat', ...) calls. ChatScreenV2.js and DealWorkspaceRoute.js
// already forward the full params object via spread (`{ ...params, ... }`,
// not a named allow-list) — confirmed by reading both files — so no change
// was needed there. DealWorkspaceScreenV2.js reacts to
// params.action === 'tracking' on mount by opening the live map (the most
// accurate honest reaction available — see that file's own comment on why
// a dedicated approve/decline banner doesn't exist yet, flagged separately
// as its own finding, not fixed here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appJs = readFileSync('App.js', 'utf8');
const notifScreen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');
const chatScreenV2 = readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const dealWorkspaceRoute = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');
const dealWorkspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('App.js: cold-start / warm push tap threads action through to the Chat route (deals kind)', () => {
  const dealsIdx = appJs.indexOf("kind === 'deals' && id");
  assert.ok(dealsIdx > -1, 'deals branch not found in navigateFromUrl');
  const block = appJs.slice(dealsIdx, dealsIdx + 900);
  assert.match(block, /navigate\('Chat', \{ dealId: id, role, action: params\.action \|\| null \}\)/);
});

test('NotificationsScreen.js (in-app tap, no push involved): same fix applied to its own separate parser', () => {
  const dealsIdx = notifScreen.indexOf('kind === "deals" && id');
  assert.ok(dealsIdx > -1, 'deals branch not found in NotificationsScreen handlePress');
  const block = notifScreen.slice(dealsIdx, dealsIdx + 500);
  assert.match(block, /navigate\("Chat", \{ dealId: id, role, action: params\.action \|\| null \}\)/);
});

test('normal deal deeplink without ?action=... still works: action becomes null, not dropped or throwing', () => {
  // parseNotifUrl builds params from actual query string content only —
  // a deeplink with no `action` param simply never sets params.action, so
  // `params.action || null` correctly resolves to null instead of leaving
  // it `undefined` (which React Navigation would otherwise carry through
  // inconsistently). This is a static-source check of that exact fallback,
  // not a behavioral claim beyond what's read here.
  assert.match(appJs, /action: params\.action \|\| null/);
  assert.match(notifScreen, /action: params\.action \|\| null/);
});

test('params.action survives to DealWorkspaceScreenV2 unmodified — ChatScreenV2/DealWorkspaceRoute forward via spread, not an allow-list', () => {
  // If either of these ever switched to naming individual params instead
  // of spreading the whole object, `action` would silently stop arriving
  // again without this test file's own assertions above catching it —
  // this test exists specifically to catch that regression.
  assert.match(chatScreenV2, /params:\s*\{\s*\n\s*\.\.\.params,/, 'ChatScreenV2 must spread all params, not allow-list specific keys');
  assert.match(dealWorkspaceRoute, /<DealWorkspaceScreenV2 \{\.\.\.props\} \/>/, 'DealWorkspaceRoute must forward all props (including route.params) unchanged');
});

test('DealWorkspaceScreenV2 opens the map when action=tracking, and only reacts to that one value', () => {
  const effectIdx = dealWorkspace.indexOf("params.action === 'tracking'");
  assert.ok(effectIdx > -1, 'no handler for action === "tracking" found');
  const block = dealWorkspace.slice(effectIdx, effectIdx + 60);
  assert.match(block, /openMap\(\)/);
});

test('missing/invalid action never crashes the effect — no unguarded property access beyond params.action', () => {
  const effectStart = dealWorkspace.indexOf('// GPS deep-link P1 fix');
  const effectEnd = dealWorkspace.indexOf('}, []);', effectStart) + '}, []);'.length;
  assert.ok(effectStart > -1 && effectEnd > effectStart, 'GPS deep-link effect block not found');
  const effectBlock = dealWorkspace.slice(effectStart, effectEnd);
  // The only conditional access is `params.action === 'tracking'` — params
  // itself is always `route?.params || {}` (defined earlier in the file),
  // so an undefined/missing action just fails the === check harmlessly.
  assert.match(effectBlock, /if \(params\.action === 'tracking'\) openMap\(\);/);
});
