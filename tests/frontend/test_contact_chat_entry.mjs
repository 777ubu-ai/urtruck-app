import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const driverDetail = fs.readFileSync('src/screens/DriverDetail.js', 'utf8');
const cargoDetail = fs.readFileSync('src/screens/CargoDetail.js', 'utf8');
const gate = fs.readFileSync('src/components/VerificationGate.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

test('driver profile resolves an authorized deal room before navigating and never passes phone data', () => {
  assert.match(driverDetail, /fetchPartnerDealRooms\([\s\S]*chatAPI\.rooms\(\{ partnerId: driver\.id, offset \}\)/);
  assert.match(driverDetail, /roomId: room\.id,[\s\S]*dealId: room\.deal_id/);
  assert.match(driverDetail, /partner: \{ id: driver\.id, name: driverName, _server: true \}/);
  assert.doesNotMatch(driverDetail, /navigation\.navigate\('Chat', \{ partner: driver, role \}\)/);
  assert.doesNotMatch(driverDetail, /setContactOpened\(true\)/);
  assert.match(driverDetail, /contactDeals\.map/);
});

test('no deal is shown only after a successful room response; load failure offers retry', () => {
  assert.match(driverDetail, /const rooms = await fetchPartnerDealRooms\(/);
  assert.match(driverDetail, /if \(rooms\.length === 0\)[\s\S]*contactNoDealBody/);
  assert.match(driverDetail, /catch \{[\s\S]*contactErrorTitle[\s\S]*contactRetry/);
  assert.match(cargoDetail, /returnToOffers: true/);
});

test('guest contact uses the normal verification gate and login route', () => {
  assert.match(driverDetail, /requireLevel\(LEVELS\.PHONE, 'contact'/);
  assert.match(gate, /navigation\.navigate\('PhoneV2'/);
  for (const text of [
    'Войдите, чтобы открыть чат согласованной сделки',
    'Sign in to open an agreed deal chat',
    'Келісілген мәміле чатын ашу үшін кіріңіз',
    '请登录以打开已达成交易的聊天',
  ]) assert.ok(gate.includes(text), `missing localized gate copy: ${text}`);
});

test('deal-chat action labels and failures have RU, KK, ZH, EN strings', () => {
  for (const key of ['openContact', 'contactLoading', 'contactErrorTitle', 'contactErrorBody', 'contactRetry', 'contactNoDealTitle', 'contactNoDealBody', 'contactViewOffers', 'contactDealChooserTitle', 'contactDealFallback']) {
    assert.ok(i18n.includes(`${key}:`), `missing ${key}`);
  }
  for (const text of ['Открыть чат сделки', 'Мәміле чатын ашу', '打开交易聊天', 'Open deal chat']) {
    assert.ok(i18n.includes(text), `missing ${text}`);
  }
});

test('third party entry stays behind authenticated room discovery and backend access checks', () => {
  assert.match(driverDetail, /chatAPI\.rooms\(\{ partnerId: driver\.id, offset \}\)/);
  assert.match(driverDetail, /if \(contactBusyRef\.current\) return/);
  assert.match(driverDetail, /partner: \{ id: driver\.id, name: driverName, _server: true \}/);
});
