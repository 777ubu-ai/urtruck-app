import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireSingleFlight, releaseSingleFlight } from '../../src/utils/singleFlightLock.js';

test('double tap while confirmation is open presents one prompt and sends one accept', async () => {
  const lock = { current: null };
  let allow;
  let prompts = 0;
  let requests = 0;
  const press = async () => {
    if (!acquireSingleFlight(lock, 'bid-1')) return false;
    try {
      prompts += 1;
      const confirmed = await new Promise((resolve) => { allow = resolve; });
      if (!confirmed) return false;
      requests += 1;
      return true;
    } finally {
      releaseSingleFlight(lock, 'bid-1');
    }
  };

  const first = press();
  assert.equal(await press(), false);
  assert.equal(prompts, 1);
  allow(true);
  assert.equal(await first, true);
  assert.equal(requests, 1);
  assert.equal(lock.current, null);
});

test('cancelled confirmation releases the action lock without a request', async () => {
  const lock = { current: null };
  let requests = 0;
  assert.equal(acquireSingleFlight(lock, 'bid-1'), true);
  assert.equal(acquireSingleFlight(lock, 'bid-1'), false);
  releaseSingleFlight(lock, 'bid-1');
  assert.equal(lock.current, null);
  assert.equal(requests, 0);
});
