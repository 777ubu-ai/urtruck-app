import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DEAL_ACCESS, classifyDealAccess } from '../../src/utils/dealAccess.js';
import { findDealInDashboard } from '../../src/utils/dealMembership.js';

const read = (path) => readFileSync(path, 'utf8');
const route = read('src/components/deal/DealWorkspaceRoute.js');
const membership = read('src/utils/dealMembership.js');
const chat = read('src/screens/ChatScreenV2.js');
const cargo = read('src/screens/CargoDetailV2.js');
const backend = read('backend/api/marketplace.py');

test('legacy deal response classification remains fail-closed', () => {
  assert.equal(classifyDealAccess({ id: 'deal-ok', status: 'accepted' }), DEAL_ACCESS.ALLOWED);
  assert.equal(classifyDealAccess({ ok: false, status: 401 }), DEAL_ACCESS.DENIED);
  assert.equal(classifyDealAccess({ ok: false, status: 403 }), DEAL_ACCESS.DENIED);
  assert.equal(classifyDealAccess({ ok: false, status: 404 }), DEAL_ACCESS.DENIED);
  assert.equal(classifyDealAccess({ ok: false, status: 500 }), DEAL_ACCESS.UNAVAILABLE);
  assert.equal(classifyDealAccess(null), DEAL_ACCESS.UNAVAILABLE);
});

test('current-user dashboard gives positive access only to listed deal ids', () => {
  const dashboard = {
    my_deals: [
      { id: 'winner-deal', status: 'accepted', driver_id: 'armando' },
      { id: 'shipper-deal', status: 'in_progress', shipper_id: 'fedya' },
    ],
  };
  assert.equal(findDealInDashboard(dashboard, 'winner-deal')?.id, 'winner-deal');
  assert.equal(findDealInDashboard(dashboard, 'shipper-deal')?.id, 'shipper-deal');
  assert.equal(findDealInDashboard(dashboard, 'loser-foreign-deal'), null);
});

test('membership request uses authenticated participant-gated GET /deals/{id}, not optimistic deal params', () => {
  // P0 2026-09-01: оракул членства — лёгкий точечный endpoint (сервер сам
  // отвечает 200/403/404), тяжёлый /market/my из probe исключён — он не
  // укладывался в 20-секундный authedFetch-таймаут на cold-start deeplink.
  assert.match(membership, /MARKET_BASE}\/deals\/\$\{encodeURIComponent\(dealId\)\}/);
  assert.doesNotMatch(membership, /MARKET_BASE}\/my/);
  assert.match(membership, /Authorization/);
  assert.match(membership, /allowed: false, status: response\.status/);
  assert.match(membership, /allowed: true, status: response\.status/);
});

test('canonical deal route waits for auth and verifies membership before workspace render', () => {
  assert.match(route, /loading: authLoading/);
  assert.match(route, /if \(authLoading\)/);
  assert.match(route, /if \(!hasToken\)/);
  assert.match(route, /verifyDealMembership\(candidateDealId\)/);
  assert.match(route, /membership\.ok && membership\.allowed/);
  assert.match(route, /if \(access !== DEAL_ACCESS\.ALLOWED \|\| !verifiedDealId\)/);
  assert.match(route, /testID="deal-access-guard"/);
  assert.match(route, /navigation\?\.navigate\?\.\('Deals', \{ role: params\.role \}\)/);

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

test('backend current-user dashboard is authenticated and deal GET still enforces participants', () => {
  assert.match(backend, /@mp_router\.get\("\/my"\)[\s\S]*?def my_dashboard\(user=Depends\(require_level\(1\)\)\)/);
  const getDealBlock = backend.match(/@mp_router\.get\("\/deals\/\{deal_id\}"\)[\s\S]*?(?=\n@mp_router\.)/)?.[0] || '';
  assert.ok(getDealBlock, 'GET /deals/{deal_id} endpoint must exist');
  assert.match(getDealBlock, /user\["id"\]/);
  assert.match(getDealBlock, /shipper_id/);
  assert.match(getDealBlock, /driver_id/);
  assert.match(getDealBlock, /status_code=403/);
});
