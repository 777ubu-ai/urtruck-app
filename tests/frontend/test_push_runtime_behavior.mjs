import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideForegroundPresentation,
  handlePushTap,
} from '../../src/utils/pushRuntime.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('slow receipt ACK never delays foreground banner decision', async () => {
  const ack = deferred();
  let ackCalls = 0;
  const policy = await decideForegroundPresentation({
    data: { event_id: 'event-slow', type: 'new_bid' },
    activeRoom: null,
    acknowledge: () => { ackCalls += 1; return ack.promise; },
    claimDisplay: async () => true,
  });
  assert.equal(policy.shouldShowBanner, true);
  await tick();
  assert.equal(ackCalls, 1);
  ack.resolve({ ok: true });
});

test('failed receipt ACK does not change open-chat suppression policy', async () => {
  const policy = await decideForegroundPresentation({
    data: { event_id: 'event-offline', type: 'chat_message', room_id: 'room-1' },
    activeRoom: 'room-1',
    acknowledge: async () => { throw new Error('offline'); },
    claimDisplay: async () => true,
  });
  assert.equal(policy.shouldShowBanner, false);
  await tick();
});

test('slow or failed opened ACK never delays deeplink and duplicate callbacks route once', async () => {
  const ack = deferred();
  const routes = [];
  let claimed = false;
  const input = {
    eventId: 'event-open',
    acknowledge: () => ack.promise,
    claimNavigation: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    refreshBadge: () => {},
    url: '/chats/room-7',
    route: (url) => routes.push(url),
  };
  assert.equal(await handlePushTap(input), true);
  assert.deepEqual(routes, ['/chats/room-7']);
  assert.equal(await handlePushTap({ ...input, acknowledge: async () => { throw new Error('offline'); } }), false);
  assert.deepEqual(routes, ['/chats/room-7']);
  ack.resolve({ ok: true });
  await tick();
});

async function withinNativeBudget(work) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('presentation_deadline_exceeded')), 1600);
    })]);
  } finally { clearTimeout(timer); }
}

test('зависшее локальное хранилище не блокирует решение о foreground push', async () => {
  const claim = deferred();
  const policy = await withinNativeBudget(decideForegroundPresentation({
    data: { event_id: 'slow-local-storage', type: 'bid_created' },
    claimDisplay: () => claim.promise,
  }));
  assert.equal(policy.shouldShowBanner, true);
  claim.resolve(true);
});

test('ошибка локальной проверки дубля не теряет foreground push', async () => {
  const policy = await decideForegroundPresentation({
    data: { event_id: 'failed-local-storage', type: 'bid_created' },
    claimDisplay: async () => { throw new Error('storage_unavailable'); },
  });
  assert.equal(policy.shouldShowBanner, true);
});

test('подтверждённый дубль по-прежнему не показывается', async () => {
  const policy = await decideForegroundPresentation({
    data: { event_id: 'duplicate', type: 'bid_created' }, claimDisplay: async () => false,
  });
  assert.equal(policy.shouldShowBanner, false);
});

test('открытая комната подавляет push без обращения к зависшему хранилищу', async () => {
  let claims = 0;
  const policy = await decideForegroundPresentation({
    data: { event_id: 'open-room', type: 'chat_message', room_id: 'room' }, activeRoom: 'room',
    claimDisplay: () => { claims++; return new Promise(() => {}); },
  });
  assert.equal(policy.shouldShowBanner, false); assert.equal(claims, 0);
});
