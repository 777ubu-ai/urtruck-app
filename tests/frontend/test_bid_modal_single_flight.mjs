import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acquireSingleFlight, releaseSingleFlight } from '../../src/utils/singleFlightLock.js';

const source = readFileSync('src/components/BidModal.js', 'utf8');

test('bid, counter and edit submissions acquire a synchronous lock before sending', async () => {
  const handle = source.slice(source.indexOf('const handleSubmit = async'), source.indexOf("const title = isCounter"));
  assert.ok(handle.indexOf("acquireSingleFlight(submitLockRef, 'bid-submit')") < handle.indexOf('marketAPI.counterBid'));
  assert.match(handle, /finally \{[\s\S]*releaseSingleFlight\(submitLockRef, 'bid-submit'\)[\s\S]*setLoading\(false\)/);

  const lock = { current: null };
  let requests = 0;
  const submit = async () => {
    if (!acquireSingleFlight(lock, 'bid-submit')) return;
    try { requests += 1; await Promise.resolve(); }
    finally { releaseSingleFlight(lock, 'bid-submit'); }
  };
  await Promise.all([submit(), submit()]);
  assert.equal(requests, 1);
  assert.equal(lock.current, null);
});
