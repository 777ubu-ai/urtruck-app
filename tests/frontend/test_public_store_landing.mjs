import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const landing = require('../../web/store/store-landing-runtime.js');
const html = readFileSync('web/store/index.html', 'utf8');
const finalizer = readFileSync('scripts/finalize-web-export.mjs', 'utf8');
const productionWorkflow = readFileSync('.github/workflows/production-deploy-execute.yml', 'utf8');
const shareLinks = readFileSync('src/utils/externalFreightShare.js', 'utf8');
const androidLinks = readFileSync('app.json', 'utf8');
const appleLinks = readFileSync('web/apple-app-site-association', 'utf8');

const expected = {
  android: 'https://play.google.com/store/apps/details?id=com.urtruck.app',
  ios: 'https://apps.apple.com/kz/app/urtruck/id6764504167',
};

assert.deepEqual(landing.STORE_URLS, expected);
assert.ok(shareLinks.includes(expected.android), 'store landing keeps the existing Android share destination');
assert.ok(shareLinks.includes(expected.ios), 'store landing keeps the existing iOS share destination');
assert.ok(html.includes(`href="${expected.android}"`));
assert.ok(html.includes(`href="${expected.ios}"`));
assert.ok(html.includes('/store/google-play-qr.png'));
assert.ok(html.includes('/store/app-store-qr.png'));
assert.ok(finalizer.includes("process.env.URTRUCK_PUBLIC_STORE_LANDING === '1'"));
assert.ok(productionWorkflow.includes('URTRUCK_PUBLIC_STORE_LANDING: "1"'));
assert.ok(!readFileSync('.github/workflows/qa2-web-deploy.yml', 'utf8').includes('URTRUCK_PUBLIC_STORE_LANDING'), 'QA2 must remain the web app for browser testing');
assert.ok(androidLinks.includes('"pathPrefix": "/cargos"'));
assert.ok(androidLinks.includes('"pathPrefix": "/trips"'));
assert.ok(appleLinks.includes('"/cargos/*"') && appleLinks.includes('"/trips/*"'));

assert.equal(landing.targetStore('Mozilla/5.0 (Linux; Android 14; Pixel)', 'Linux armv8l'), 'android');
assert.equal(landing.targetStore('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'iPhone'), 'ios');
assert.equal(landing.targetStore('Mozilla/5.0 (Macintosh)', 'MacIntel', 5), 'ios', 'touch iPadOS UA opens App Store');
assert.equal(landing.targetStore('Mozilla/5.0 (Windows NT 10.0)', 'Win32'), null, 'desktop gets both stores and QR codes');

const now = Date.now();
const pendingProvider = { getItem: (key) => key === 'ur_social_pending_provider'
  ? JSON.stringify({ provider: 'google', startedAt: now }) : null };
const noPending = { getItem: () => null };
assert.equal(landing.hasAuthCallback({ search: '?social_auth=1&code=oauth-code&state=csrf-state', hash: '' }, pendingProvider, now), true);
assert.equal(landing.hasAuthCallback({ search: '', hash: '#social_auth=1&access_token=token&refresh_token=refresh' }, pendingProvider, now), false, 'marker must be in the registered redirect query');
assert.equal(landing.hasAuthCallback({ search: '?social_auth=1', hash: '' }, pendingProvider, now), false, 'bare marker cannot expose web screens');
assert.equal(landing.hasAuthCallback({ search: '?social_auth=1&code=fake&state=fake', hash: '' }, noPending, now), false, 'URL-only fake callback cannot expose web screens');
assert.equal(landing.hasAuthCallback({ search: '?social_auth=1&code=expired', hash: '' }, {
  getItem: () => JSON.stringify({ provider: 'google', startedAt: now - 11 * 60 * 1000 }),
}, now), false, 'expired flow state cannot expose web screens');
assert.equal(landing.hasAuthCallback({ search: '?social_auth=1&error=access_denied', hash: '' }, pendingProvider, now), false, 'cancelled OAuth returns to store landing');
assert.equal(landing.hasAuthCallback({ search: '?code=oauth-code&state=csrf-state', hash: '' }, pendingProvider, now), false, 'unregistered callback URL is not supported');
assert.equal(landing.hasAuthCallback({ search: '?utm_source=share', hash: '' }, pendingProvider, now), false);

const redirects = [];
const scheduled = [];
const session = new Map();
const fakeWindow = {
  location: { search: '', hash: '', assign: (url) => redirects.push(url) },
  navigator: { userAgent: 'Android', platform: 'Linux armv8l', maxTouchPoints: 0 },
  localStorage: { getItem: () => null },
  document: {
    documentElement: { dataset: {} }, visibilityState: 'visible',
    querySelector: () => ({ setAttribute: () => {} }),
  },
  sessionStorage: { getItem: (key) => session.get(key), setItem: (key, value) => session.set(key, value) },
  setTimeout: (fn) => scheduled.push(fn),
};
landing.mount(fakeWindow);
assert.equal(fakeWindow.document.documentElement.dataset.urtruckPlatform, 'android');
assert.equal(scheduled.length, 1);
scheduled[0]();
assert.deepEqual(redirects, [expected.android]);
landing.mount(fakeWindow);
assert.equal(scheduled.length, 1, 'one redirect attempt per browser session prevents a loop');

const restored = [];
const callbackWindow = {
  location: { search: '?social_auth=1&code=secret', hash: '' },
  navigator: { userAgent: 'Android', platform: 'Linux', maxTouchPoints: 0 },
  localStorage: { getItem: (key) => key === 'ur_social_pending_provider'
    ? JSON.stringify({ provider: 'google', startedAt: Date.now() }) : null },
  __URTRUCK_APP_SHELL_BASE64__: Buffer.from('<html><head></head><body>OAuth callback</body></html>').toString('base64'),
  document: { open() {}, write: (value) => restored.push(value), close() {} },
  setTimeout: () => { throw new Error('auth callback must not redirect to a store'); },
};
landing.mount(callbackWindow);
assert.deepEqual(restored, ['<html><head></head><body>OAuth callback</body></html>']);

console.log('PASS: store landing, platform fallback, callback restoration, and redirect loop guard');
