import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const api = fs.readFileSync(path.join(root, 'src/utils/marketAPI.js'), 'utf8');
const method = api.slice(api.indexOf('  async listCargos('), api.indexOf('  async getCargo('));

function isolatedListCargos({ status = 200 } = {}) {
  let captured;
  const response = { ok: status >= 200 && status < 300, status,
    json: async () => ({ cargos: [], search_contract: 1 }) };
  const fn = new Function('authedFetch', 'BASE', 'URLSearchParams', 'headers',
    'return {' + method + '}.listCargos;')(
    async (url, init) => { captured = { url, init }; return response; },
    '/api/v1/market', URLSearchParams,
    async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer qa-session' }),
  );
  return { fn, get captured() { return captured; } };
}

test('saved-only cargo search sends the current session for server-side ownership filtering', async () => {
  const harness = isolatedListCargos();
  const result = await harness.fn({ savedOnly: true, limit: 50, offset: 0 });
  assert.match(harness.captured.url, /saved_only=true/);
  assert.equal(harness.captured.init?.headers?.Authorization, 'Bearer qa-session');
  assert.equal(result.serverError, undefined);
});

test('public cargo search remains unauthenticated when saved-only is off', async () => {
  const harness = isolatedListCargos();
  const result = await harness.fn({ savedOnly: false, limit: 50, offset: 0 });
  assert.match(harness.captured.url, /saved_only=false/);
  assert.equal(harness.captured.init?.headers?.Authorization, undefined);
  assert.equal(result.serverError, undefined);
});
