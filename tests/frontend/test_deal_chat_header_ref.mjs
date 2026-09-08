// DS-2026 regression: шапка чата сделки (N-01 / N-02).
//
// Дефекты из физического QA (08.09.2026):
//  - N-01 (P2): в шапке показывался сырой UUID сделки ("1DA9606F-42A6-...").
//  - N-02 (P3): роль контрагента резалась — «Грузоотправит…» не влезала.
//
// Канон: первая строка меты — короткий человеко-читаемый ref
// (#XXXXXX · Загрузка: дата), вторая — «Роль: Имя» в отдельной строке.
//
// Run: node tests/frontend/test_deal_chat_header_ref.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('raw UUID is humanized to a short readable ref', () => {
  assert.match(src, /const humanizeCode = \(value\) => \{/);
  assert.match(src, /#?#\$\{compact\.slice\(-6\)\.toUpperCase\(\)\}/);
  assert.match(src, /\^\[0-9a-f\]\{32\}\$/i);
});

test('header meta line shows short code + loading date, not the raw id', () => {
  assert.match(src, /const compactHeaderMeta = \[\s*shortCode,/);
  assert.doesNotMatch(src, /\{tripCode \? <Text style=\{s\.metaPrimary\}/);
  assert.match(src, /\{compactHeaderMeta \? <Text style=\{s\.metaPrimary\}[^>]*>\{compactHeaderMeta\}<\/Text>/);
});

test('counterparty role:name gets its own line (no truncation of long roles)', () => {
  assert.match(src, /const headerPartnerText = `\$\{isDriver \? ui\.shipper : ui\.driver\}: \$\{partnerName \|\| '—'\}`/);
  assert.match(src, /<Text style=\{s\.partnerText\}[^>]*>\{headerPartnerText\}<\/Text>/);
  // Роль больше не участвует в compactHeaderMeta.
  const metaBody = src.match(/const compactHeaderMeta = \[([\s\S]*?)\]\.filter/);
  assert.ok(metaBody && !/ui\.(shipper|driver)/.test(metaBody[1]), 'role must not be squeezed into the meta line');
});
