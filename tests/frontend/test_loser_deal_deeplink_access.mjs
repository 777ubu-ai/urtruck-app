import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DEAL_ACCESS, classifyDealAccess } from '../../src/utils/dealAccess.js';

const read = (path) => readFileSync(path, 'utf8');
const route = read('src/components/deal/DealWorkspaceRoute.js');
const chat = read('src/screens/ChatScreenV2.js');
const cargo = read('src/screens/CargoDetailV2.js');
const backend = read('backend/api/marketplace.py');

test('deal access classification is fail-closed for non-participants and errors', () => {
  assert.equal(classifyDealAccess({ id: 'deal-ok', status: 'accepted' }), DEAL_ACCESS.ALLOWED);
  assert.equal(classifyDealAccess({ ok: false, status: 401 }), DEAL_ACCESS.DENIED);
  assert.equal(classifyDealAccess({ ok: false, status: 403 }), DEAL_ACCESS.DENIED);
  assert.equal(classifyDealAccess({ ok: false, status: 404 }), DEAL_ACCESS.DENIED);
  assert.equal(classifyDealAccess({ ok: false, status: 500 }), DEAL_ACCESS.UNAVAILABLE);
  assert.equal(classifyDealAccess(null), DEAL_ACCESS.UNAVAILABLE);
});

test('canonical deal route verifies backend membership before workspace render', () => {
  assert.match(route, /marketAPI\.getDeal\(candidateDealId\)/);
  assert.match(route, /classifyDealAccess\(result\)/);
  assert.match(route, /if \(access !== DEAL_ACCESS\.ALLOWED \|\| !verifiedDealId\)/);
  assert.match(route, /testID="deal-access-guard"/);
  assert.match(route, /navigation\?\.navigate\?\.\('Deals', \{ role: params\.role \}\)/);
  assert.match(route, /\[requestedDealId, requestedRoomId, userId, attempt\]/);

  const guardIndex = route.indexOf('if (access !== DEAL_ACCESS.ALLOWED || !verifiedDealId)');
  const renderIndex = route.lastIndexOf('<DealLocationPermissionGate');
  assert.ok(guardIndex >= 0 && renderIndex > guardIndex, 'guard must execute before gated workspace render');
});

test('direct room deeplink must resolve through current user rooms and then verified deal', () => {
  assert.match(route, /chatAPI\.rooms\(\)/);
  assert.match(route, /String\(item\.id\) === String\(requestedRoomId\)/);
  assert.match(route, /if \(!room\?\.deal_id\)/);
  assert.match(route, /setAccess\(DEAL_ACCESS\.DENIED\)/);
  assert.match(route, /params: \{ \.\.\.params, dealId: verifiedDealId \}/);
});

test('deeplink entry screens converge on canonical guarded route', () => {
  assert.match(chat, /import DealWorkspaceRoute/);
  assert.match(cargo, /import DealWorkspaceRoute/);
  assert.doesNotMatch(chat, /import DealWorkspaceScreenV2/);
  assert.doesNotMatch(cargo, /import DealWorkspaceScreenV2/);
});

test('no screen bypasses DealWorkspaceRoute for accepted deal workspace', () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (/\.(js|jsx|ts|tsx)$/.test(name)) {
        const source = read(path);
        if (/from\s+['"][^'"]*DealWorkspaceScreenV2(?:\.js)?['"]/.test(source)) hits.push(path);
      }
    }
  };
  walk('src');
  assert.deepEqual(hits.sort(), [
    'src/components/deal/DealWorkspaceRoute.js',
    'src/screens/DealWorkspaceScreenV2.android.js',
  ].sort());
});

test('backend remains authoritative: only shipper or accepted driver may GET a deal', () => {
  assert.match(backend, /user\["id"\]\s+not in\s+\(d\["shipper_id"\],\s*d\["driver_id"\]\)/);
  assert.match(backend, /HTTPException\(status_code=403, detail="Нет доступа к сделке"\)/);
});
