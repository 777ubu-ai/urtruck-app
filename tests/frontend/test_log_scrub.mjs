import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrubString, scrubValue, scrubSentryEvent } from '../../src/utils/logScrub.js';

const noLeak = (obj, needles) => {
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') return Object.values(v).forEach(walk);
    if (typeof v === 'string') needles.forEach((n) => assert.ok(!v.includes(n), `leak: ${n} in ${v}`));
  };
  walk(obj);
};

test('scrubString covers bearer/jwt/expo/signed-url patterns', () => {
  assert.equal(scrubString('Bearer abcdefgh12345678'), 'Bearer ***');
  assert.match(scrubString('tok eyJabcdef.abcdefgh.abcde end'), /eyJabcdef\.<jwt:\*\*\*>|<jwt:\*\*\*>/);
  assert.equal(scrubString('ExponentPushToken[abcdef123456]'), 'ExponentPushToken[***]');
  assert.equal(scrubString('/storage/docs/a.pdf?exp=123&sig=deadbeefcafe1234'), '/storage/docs/a.pdf?exp=123&sig=***');
  assert.equal(scrubString('failed refresh_token= abcdef123456 ok'), 'failed refresh_token=*** ok');
});

test('scrubValue redacts sensitive keys recursively', () => {
  const out = scrubValue({
    request: { headers: { Authorization: 'Bearer xyzxyzxyz123', Accept: 'application/json' } },
    extra: { push_token: 'ExponentPushToken[abcdefghij]', count: 2 },
  });
  assert.equal(out.request.headers.Authorization, '***');
  assert.equal(out.request.headers.Accept, 'application/json');
  assert.equal(out.extra.push_token, '***');
  assert.equal(out.extra.count, 2);
});

test('scrubSentryEvent leaves no raw secret anywhere in the event', () => {
  const event = {
    message: 'upload failed Bearer syntheticfrontendtoken1111',
    breadcrumbs: [{ message: 'GET /storage/x.pdf?sig=syntheticsig999999999', data: { token: 'syntheticftoken2222' } }],
    request: { headers: { Cookie: 'synthetic-cookie-3333' } },
  };
  const out = scrubSentryEvent(event);
  noLeak(out, ['syntheticfrontendtoken', 'syntheticsig', 'syntheticftoken', 'synthetic-cookie']);
});

test('scrubSentryEvent drops the event rather than leaking on scrub failure', () => {
  const evil = {};
  Object.defineProperty(evil, 'x', { get() { throw new Error('synthetic'); }, enumerable: true });
  assert.equal(scrubSentryEvent(evil), null);
});

test('App.js wires beforeSend scrubber into Sentry.init', () => {
  const appSource = readFileSync('App.js', 'utf8');
  assert.match(appSource, /import \{ scrubSentryEvent \} from '\.\/src\/utils\/logScrub';/);
  assert.match(appSource, /beforeSend: scrubSentryEvent/);
});
