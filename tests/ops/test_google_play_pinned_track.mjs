import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(repo, 'scripts/ops/google-play-pinned-track.mjs');

function runMocked(mode, scenario = mode) {
  const root = mkdtempSync(path.join(tmpdir(), 'urtruck-play-api-test-'));
  try {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const preload = `
      import assert from 'node:assert/strict';
      import { createVerify } from 'node:crypto';
      const pub = process.env.MOCK_PUBLIC_KEY;
      const scenario = process.env.PLAY_MOCK_SCENARIO;
      const calls = [];
      let editCount = 0;
      let productionTrack = { track: 'production', releases: [] };
      const internalTrack = { track: 'internal', releases: scenario === 'promote'
        ? [{ status: 'completed', versionCodes: [214116271] }]
        : [{ status: 'completed', versionCodes: [213700001] }] };
      const tracks = () => [internalTrack, productionTrack];
      globalThis.fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        const method = init.method || 'GET';
        if (url.hostname === 'oauth2.googleapis.com') {
          const params = new URLSearchParams(init.body);
          const jwt = params.get('assertion');
          const [header, payload, signature] = jwt.split('.');
          const verifier = createVerify('RSA-SHA256');
          verifier.update(header + '.' + payload);
          assert.equal(verifier.verify(pub, Buffer.from(signature, 'base64url')), true, 'service-account JWT signature must validate');
          assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).scope, 'https://www.googleapis.com/auth/androidpublisher');
          return new Response(JSON.stringify({ access_token: 'mock-access-token' }), { status: 200 });
        }
        assert.equal(init.headers.authorization, 'Bearer mock-access-token');
        calls.push(method + ' ' + url.pathname + url.search);
        if (url.pathname.endsWith('/edits') && method === 'POST') {
          editCount += 1;
          return new Response(JSON.stringify({ id: 'edit-' + editCount }), { status: 200 });
        }
        if (url.pathname.endsWith('/tracks') && method === 'GET') {
          return new Response(JSON.stringify({ tracks: tracks() }), { status: 200 });
        }
        if (url.pathname.endsWith('/countryAvailability/production') && method === 'GET') {
          return new Response(JSON.stringify({ syncWithProduction: false, countries: [{ countryCode: 'KZ' }, { countryCode: 'US' }], restOfWorld: false }), { status: 200 });
        }
        if (url.pathname.endsWith('/tracks/production') && method === 'PUT') {
          productionTrack = JSON.parse(init.body);
          return new Response(JSON.stringify(productionTrack), { status: 200 });
        }
        if (url.pathname.endsWith(':commit') && method === 'POST') return new Response('{}', { status: 200 });
        if (/\\/edits\\/edit-[0-9]+$/.test(url.pathname) && method === 'DELETE') return new Response(null, { status: 204 });
        throw new Error('Unexpected mocked Google Play API request: ' + method + ' ' + url.pathname);
      };
      process.on('exit', () => {
        if (process.env.PLAY_MOCK_ASSERT_CALLS === '1') {
          assert(calls.some((call) => call.startsWith('DELETE ')), 'temporary Google Play edit must be cleaned up or committed');
          if (scenario === 'promote') {
            assert(calls.some((call) => call.includes(':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW')));
            assert.equal(productionTrack.releases.at(-1).versionCodes[0], 214116271);
            assert.equal(productionTrack.releases.at(-1).status, 'completed');
          }
        }
      });
    `;
    const preloadPath = path.join(root, 'mock.mjs');
    writeFileSync(preloadPath, preload);
    return spawnSync(process.execPath, [
      '--import', preloadPath,
      helper,
      mode,
    ], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        MOCK_PUBLIC_KEY: publicPem,
        PLAY_MOCK_SCENARIO: scenario,
        PLAY_MOCK_ASSERT_CALLS: '1',
        PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'unit-test@example.invalid', private_key: privatePem }),
        TARGET_TRACK: mode === 'promote' ? 'production' : 'internal',
        RELEASE_STATUS: mode === 'promote' ? 'completed' : 'draft',
        USER_FRACTION: '',
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('track preflight verifies service JWT, reads tracks, and deletes only its temporary edit', () => {
  const result = runMocked('preflight');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PLAY_TARGET_TRACK=internal; target_versionCode=214116271/);
  assert.doesNotMatch(result.stdout + result.stderr, /mock-access-token|private_key|unit-test@example/);
});

test('production promotion reuses the completed internal version and reads back unchanged countries', () => {
  const result = runMocked('promote');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"versionCode":214116271/);
  assert.match(result.stdout, /"productionCountryCodes":\["KZ","US"\]/);
  assert.doesNotMatch(result.stdout + result.stderr, /mock-access-token|private_key|unit-test@example/);
});
