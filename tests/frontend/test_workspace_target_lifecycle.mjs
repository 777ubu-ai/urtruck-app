import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dealWorkspaceIdentity } from '../../src/utils/dealWorkspaceIdentity.js';
const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const body = source.split('const startTrip = React.useCallback(async () => {')[1].split('}, [dealId, trackingLoading')[0];
function fixture(stopAt) {
  const calls = [], scope = { current: { focused: true, generation: 0 } }; let tracking = false;
  const step = name => async () => { calls.push(name); if (stopAt === name) { scope.current.focused = false; scope.current.generation++; } return name === 'health' ? { state: 'ready' } : { ok: true, lat: 1 }; };
  const env = { dealId: 'A', trackingLoading: false, statusLoading: false, tripStartBusy: { current: false }, tripActionScope: scope, mounted: { current: true }, setTrackingLoading: v => { tracking = v; }, ensureBackgroundLocationPermission: step('permission'), getLocationHealth: step('health'), changeDealStatus: step('status'), getCurrentLocationPayload: step('point'), marketAPI: { sendDealLocation: async (id) => calls.push('send:' + id) }, setLocation: () => calls.push('render'), toast: () => calls.push('toast'), t: v => v };
  return { run: new Function(...Object.keys(env), `return async function() { ${body} };`)(...Object.values(env)), calls, busy: () => tracking };
}
test('new deal/room resets route host; changing display metadata does not', () => {
  assert.notEqual(dealWorkspaceIdentity({ dealId: 'A' }), dealWorkspaceIdentity({ dealId: 'B' }));
  assert.notEqual(dealWorkspaceIdentity({ roomId: 'A' }), dealWorkspaceIdentity({ roomId: 'B' }));
  assert.equal(dealWorkspaceIdentity({ dealId: 'A', partner: { id: 'u', name: 'old' } }), dealWorkspaceIdentity({ dealId: 'A', partner: { id: 'u', name: 'new' } }));
});
for (const stopAt of ['permission', 'health', 'status', 'point']) test('leaving during ' + stopAt + ' stops remaining status/GPS steps', async () => {
  const f = fixture(stopAt); await f.run(); const all = ['permission', 'health', 'status', 'point'];
  assert.deepEqual(f.calls, all.slice(0, all.indexOf(stopAt) + 1)); assert.equal(f.busy(), false);
});
test('current focused workspace completes only its own deal and resets busy', async () => {
  const f = fixture(); await f.run(); assert.deepEqual(f.calls, ['permission', 'health', 'status', 'point', 'send:A', 'render']); assert.equal(f.busy(), false);
});
