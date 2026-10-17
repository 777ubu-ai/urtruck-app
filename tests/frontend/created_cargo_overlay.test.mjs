import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCreatedCargoOverlay } from '../../src/utils/createdCargoOverlay.js';

const createdCargo = { id: 'qa-cargo-1', status: 'active', cargo_desc: 'newly published' };

test('keeps the just-published cargo visible while an authoritative response is pending', () => {
  const result = reconcileCreatedCargoOverlay([{ id: 'older' }], createdCargo);
  assert.deepEqual(result.items.map((item) => item.id), ['qa-cargo-1', 'older']);
  assert.equal(result.overlay, createdCargo);
});

test('uses server fields and does not resurrect a cargo already taken into a deal', () => {
  const serverCargo = { id: 'qa-cargo-1', status: 'taken', cargo_desc: 'edited on server' };
  const result = reconcileCreatedCargoOverlay([serverCargo], createdCargo, { authoritative: true });
  assert.deepEqual(result.items, [serverCargo]);
  assert.equal(result.overlay, null);
});

test('does not resurrect a cargo omitted from a successful active-list response', () => {
  const result = reconcileCreatedCargoOverlay([{ id: 'older' }], createdCargo, { authoritative: true });
  assert.deepEqual(result.items, [{ id: 'older' }]);
  assert.equal(result.overlay, null);
});

test('does not duplicate an item already returned by the server', () => {
  const serverCargo = { id: 'qa-cargo-1', status: 'active', cargo_desc: 'authoritative' };
  const result = reconcileCreatedCargoOverlay([serverCargo], createdCargo);
  assert.deepEqual(result.items, [serverCargo]);
  assert.equal(result.items[0].cargo_desc, 'authoritative');
});
