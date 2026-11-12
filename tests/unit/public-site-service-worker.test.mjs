import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public-site/sw.js', import.meta.url), 'utf8');
const handlers = new Map();
const cacheKeys = new Set(['urtruck-v18-market', 'urtruck-static-v18', 'urtruck-info-v0', 'private-unrelated-cache']);
const deleted = [];
let claimed = false;
const self = {
  location: { origin: 'https://urtruck.kz' },
  addEventListener: (name, handler) => handlers.set(name, handler),
  skipWaiting: async () => {},
  clients: { claim: async () => { claimed = true; }, matchAll: async () => [], openWindow: async () => {} },
  registration: { showNotification: async () => {} },
};
const caches = {
  keys: async () => [...cacheKeys],
  delete: async (name) => { deleted.push(name); return cacheKeys.delete(name); },
};
vm.runInNewContext(source, { self, caches, URL, Promise, fetch: async () => ({ ok: true }) });

const activation = handlers.get('activate');
assert.equal(typeof activation, 'function');
let activationPromise;
activation({ waitUntil: (promise) => { activationPromise = promise; } });
await activationPromise;
assert.deepEqual(deleted.sort(), ['urtruck-info-v0', 'urtruck-static-v18', 'urtruck-v18-market'].sort());
assert.deepEqual([...cacheKeys], ['private-unrelated-cache']);
assert.equal(claimed, true, 'new worker claims the public-site clients');
assert.equal(typeof handlers.get('push'), 'function', 'existing browser push handler remains registered');
assert.equal(typeof handlers.get('notificationclick'), 'function', 'notification click handler remains registered');

console.log('PASS: old UrTruck shell caches are retired; unrelated cache and storage are untouched; push handlers remain');
