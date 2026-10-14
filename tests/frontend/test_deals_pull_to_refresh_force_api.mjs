import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/screens/DealsScreen.js', import.meta.url), 'utf8');

function loadBody() {
  const marker = 'const load = useCallback(async (';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'DealsScreen.load callback is present');
  const open = source.indexOf('{', source.indexOf('=>', start) + 2);
  assert.ok(open >= 0, 'DealsScreen.load body is present');
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  assert.fail('DealsScreen.load callback body is unterminated');
}

test('manual Deals pull-to-refresh bypasses the short shared dashboard cache', async () => {
  let options;
  const updates = {};
  const load = new Function(
    'loadRequestRef', 'marketAPI', 'notificationsAPI', 'setLoadError', 'setLoading', 'setAllDeals',
    'setIncomingBids', 'setMyBids', 'setUnreadNotifPaths', 'unreadNotificationPaths',
    `return async function load({ force = false } = {}) { ${loadBody()} };`,
  )({ current: 0 }, {
    myDashboard: async (received) => {
      options = received;
      return { my_deals: [{ id: 'deal-1', status: 'in_progress' }], incoming_bids: [], my_bids: [] };
    },
  }, {
    list: async () => ({ notifications: [] }),
  },
  (value) => { updates.error = value; },
  (value) => { updates.loading = value; },
  (value) => { updates.deals = value; },
  (value) => { updates.incoming = value; },
  (value) => { updates.mine = value; },
  (value) => { updates.unread = value; },
  () => [],
  );

  await load({ force: true });
  assert.deepEqual(options, { force: true }, 'the API receives force=true for a manual refresh');
  assert.deepEqual(updates.deals.map((deal) => deal.id), ['deal-1']);
  assert.match(source, /useSafeRefresh\(\(\) => load\(\{ force: true \}\)\)/,
    'only the user pull-to-refresh forces a fresh dashboard read');
  assert.match(source, /setInterval\(load, 10000\)/,
    'background refresh keeps the normal short-cache path');
});
