import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StackRouter } from '@react-navigation/routers';

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

test('all entry points reuse the single Chat route despite different deal and room params', () => {
  assert.equal((navigator.match(/<Stack\.Screen name="Chat"/g) || []).length, 3);
  assert.match(navigator, /function chatRouteId\(\) \{\s*return 'chat-workspace';/);
  assert.equal((navigator.match(/getId=\{chatRouteId\}/g) || []).length, 3);
  assert.match(app, /navRef\.current\.navigate\('Chat', \{ dealId: id, role, action:/);
  assert.match(app, /navRef\.current\.navigate\('Chat', \{ roomId: id, role \}\)/);
  assert.doesNotMatch(app, /navigate\('Main',[\s\S]{0,120}navigate\('Chat'/);

  const router = StackRouter({ initialRouteName: 'Main' });
  const config = {
    routeNames: ['Main', 'Chat', 'Profile'],
    routeParamList: { Main: undefined, Chat: undefined, Profile: undefined },
    routeGetIdList: { Chat: () => 'chat-workspace' },
  };
  const cases = [
    [
      { type: 'NAVIGATE', payload: { name: 'Chat', params: { dealId: 'deal-1', roomId: 'room-1', partner: { id: 'partner-1' } } } },
      { type: 'NAVIGATE', payload: { name: 'Profile' } },
      { type: 'NAVIGATE', payload: { name: 'Chat', params: { dealId: 'deal-1' } } },
    ],
    [
      { type: 'NAVIGATE', payload: { name: 'Chat', params: { dealId: 'deal-1', roomId: 'room-1', partner: { id: 'partner-1' } } } },
      { type: 'NAVIGATE', payload: { name: 'Profile' } },
      { type: 'NAVIGATE', payload: { name: 'Chat', params: { roomId: 'room-1' } } },
    ],
  ];
  for (const actions of cases) {
    let state = router.getInitialState(config);
    for (const action of actions) state = router.getStateForAction(state, action, config);
    assert.equal(state.routes.filter((route) => route.name === 'Chat').length, 1);
    assert.equal(state.routes.at(-1).name, 'Chat');
    assert.deepEqual(state.routes.at(-1).params, actions.at(-1).payload.params);
  }
});

test('only the focused completed-deal workspace opens its review prompt', () => {
  assert.match(workspace, /const isFocused = useIsFocused\(\)/);
  assert.match(workspace, /next === 'eligible' && isFocused/);
  assert.match(workspace, /fallback === 'eligible' && isFocused/);
  assert.match(workspace, /if \(!isFocused\) setRatingModalOpen\(false\)/);
  assert.match(workspace, /visible=\{ratingModalOpen && isFocused\}/);
});
