import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.js', 'utf8');
const navigator = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('cold-start URL is read once and a pending URL is consumed exactly once', () => {
  const initialEffect = app.slice(
    app.indexOf('Linking.getInitialURL()'),
    app.indexOf('// Native (iOS/Android)', app.indexOf('Linking.getInitialURL()')),
  );
  assert.match(initialEffect, /\}, \[\]\);/);
  assert.match(app, /const dispatchPendingUrl = useCallback\(\(\) => \{[\s\S]*pendingUrlRef\.current = null;[\s\S]*navigateFromUrl/);
  assert.match(app, /routeFromUrlRef\.current = routeFromUrl/);
});

test('same deal or room uses one stack route and direct links do not pop it first', () => {
  assert.match(navigator, /function chatRouteId\([\s\S]*if \(p\.roomId\) return `room:\$\{String\(p\.roomId\)\}`/);
  assert.equal((navigator.match(/getId=\{chatRouteId\}/g) || []).length, 3);
  assert.match(app, /navRef\.current\.navigate\('Chat', \{ dealId: id, role, action:/);
  assert.match(app, /navRef\.current\.navigate\('Chat', \{ roomId: id, role \}\)/);
  assert.doesNotMatch(app, /navigate\('Main',[\s\S]{0,120}navigate\('Chat'/);
});

test('only the focused completed-deal workspace opens its review prompt', () => {
  assert.match(workspace, /const isFocused = useIsFocused\(\)/);
  assert.match(workspace, /next === 'eligible' && isFocused/);
  assert.match(workspace, /fallback === 'eligible' && isFocused/);
  assert.match(workspace, /if \(!isFocused\) setRatingModalOpen\(false\)/);
  assert.match(workspace, /visible=\{ratingModalOpen && isFocused\}/);
});
