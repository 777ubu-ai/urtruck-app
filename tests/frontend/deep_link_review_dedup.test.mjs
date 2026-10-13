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
  assert.doesNotMatch(navigator, /getId=/);
  assert.match(app, /navRef\.current\.navigate\('Chat', \{ dealId: id, role, action:/);
  assert.match(app, /navRef\.current\.navigate\('Chat', \{ roomId: id, role \}\)/);
  assert.doesNotMatch(app, /navigate\('Main',[\s\S]{0,120}navigate\('Chat'/);

  const router = StackRouter({ initialRouteName: 'Main' });
  const config = {
    routeNames: ['Main', 'Chat'],
    routeParamList: { Main: undefined, Chat: undefined },
    routeGetIdList: {},
  };
  const cases = [
    [{ dealId: 'deal-1', roomId: 'room-1', partner: { id: 'partner-1' } }, { dealId: 'deal-1' }],
    [{ dealId: 'deal-1', roomId: 'room-1', partner: { id: 'partner-1' } }, { roomId: 'room-1' }],
  ];
  for (const params of cases) {
    let state = router.getInitialState(config);
    for (const nextParams of params) {
      state = router.getStateForAction(state, { type: 'NAVIGATE', payload: { name: 'Chat', params: nextParams } }, config);
    }
    assert.equal(state.routes.filter((route) => route.name === 'Chat').length, 1);
    assert.deepEqual(state.routes.at(-1).params, params.at(-1));
  }
});

test('only the focused completed-deal workspace opens its review prompt', () => {
  assert.match(workspace, /const isFocused = useIsFocused\(\)/);
  assert.match(workspace, /next === 'eligible' && isFocused/);
  assert.match(workspace, /fallback === 'eligible' && isFocused/);
  assert.match(workspace, /if \(!isFocused\) setRatingModalOpen\(false\)/);
  assert.match(workspace, /visible=\{ratingModalOpen && isFocused\}/);
});
