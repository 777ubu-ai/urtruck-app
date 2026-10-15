import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cargoPublishErrorMessage } from '../../src/utils/cargoPublishError.js';

const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const marketApi = readFileSync('src/utils/marketAPI.js', 'utf8');
const screen = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');

test('ROLE_NOT_ALLOWED uses selected-locale copy while unknown errors retain server detail', () => {
  const translations = {
    cargo_role_not_allowed: 'localized role denial',
    send_error: 'localized send error',
  };
  const t = (key) => translations[key];

  assert.equal(cargoPublishErrorMessage({ errorCode: 'ROLE_NOT_ALLOWED', detail: 'Russian backend text' }, t), 'localized role denial');
  assert.equal(cargoPublishErrorMessage({ detail: 'legacy backend text' }, t), 'legacy backend text');
  assert.equal(cargoPublishErrorMessage({ detail: '' }, t), 'localized send error');
});

test('cargo API preserves the stable backend error code without changing role enforcement', () => {
  assert.match(marketApi, /errorCode: typeof d\?\.detail\?\.error === 'string' \? d\.detail\.error : null/);
  assert.match(screen, /cargoPublishErrorMessage\(r, t\)/);
  const marketplace = readFileSync('backend/api/marketplace.py', 'utf8');
  assert.match(marketplace, /_require_role\(user, \("client",\), "разместить груз"\)/);
  assert.match(marketplace, /"error": "ROLE_NOT_ALLOWED"/);
});

test('role-denial copy is explicitly defined in RU, KK, ZH and EN', () => {
  assert.equal((i18n.match(/\bcargo_role_not_allowed:/g) || []).length, 4);
  assert.match(i18n, /cargo_role_not_allowed: '.*货物/);
});
