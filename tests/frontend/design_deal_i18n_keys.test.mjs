// Design v1 Commit 4 — deal status label i18n contract.
// Static check over src/utils/i18n.js locale blocks:
//   - deal_status_at_border exists in ALL four locales and is distinct from
//     deal_status_in_progress (the deals list used to collapse at_border
//     into the in_progress label «В работе»/«进行中»);
//   - deal_event_status_completed exists in ZH (no RU fallback leak) and
//     mirrors the RU «Завершён» semantics (已完成/交易已完成), distinct from
//     deal_event_status_received in every locale;
//   - status_completed / status_received list labels exist in all locales;
//   - deal_no («Сделка №») exists in all four locales for the deal-room
//     header second line and the deals-inbox card priceMeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const lines = i18n.split('\n');

// Extract a locale block: from `  XX: {` up to ITS OWN matching closing
// brace, tracked by depth rather than by a fixed-indent line pattern.
//
// I18N-16 (2026-09-12): the previous version looked for the first line
// matching `/^  \},?$/` (a literal 2-space-indented closing brace). That
// happened to "work" only by coincidence: RU/KK/ZH/EN's own object-literal
// closings are written UNINDENTED in this file ("},\n" at column 0, not
// "  },\n"), so that regex never actually matched any of the four real
// locale-block ends — it silently ran on until it hit some unrelated
// 2-space-indented `}` deep in the module's tail helper functions,
// accidentally including RU/KK/ZH/EN (and, once the 12 new locales were
// added below EN, however many of THOSE it reached first too) in every
// "block". Key lookups still resolved correctly before because the target
// locale's own (inline-style) value always happened to be the leftmost
// match in that over-captured text. Adding the new locale blocks changed
// what came first, and a leftmost-match lookup started returning a
// different locale's value (e.g. ZH's status_completed reading back as
// UZ's) — see feat/claude-i18n-16-locales-20260912. Depth-tracking makes
// this correct regardless of any block's indentation style.
function localeBlock(lang) {
  const start = lines.findIndex((l) => l === `  ${lang}: {`);
  assert.notEqual(start, -1, `${lang}: block not found`);
  let depth = 1;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    depth += opens - closes;
    if (depth <= 0) { end = i; break; }
  }
  assert.notEqual(end, -1, `${lang}: block end not found`);
  return lines.slice(start + 1, end).join('\n');
}

function keyValue(block, key) {
  // First key on its own line, or a key inline after other keys — the
  // i18n file mixes both styles.
  const own = block.match(new RegExp(`^\\s{4}${key}:\\s*'([^']*)'`, 'm'));
  if (own) return own[1];
  const inline = block.match(new RegExp(`\\s${key}:\\s*'([^']*)'`));
  return inline ? inline[1] : null;
}

const LOCALES = ['RU', 'KK', 'ZH', 'EN'];
const blocks = Object.fromEntries(LOCALES.map((l) => [l, localeBlock(l)]));

test('deal_status_at_border exists in all four locales and never equals in_progress', () => {
  for (const lang of LOCALES) {
    const atBorder = keyValue(blocks[lang], 'deal_status_at_border');
    const inProgress = keyValue(blocks[lang], 'deal_status_in_progress');
    assert.ok(atBorder, `${lang}: deal_status_at_border is missing`);
    assert.ok(inProgress, `${lang}: deal_status_in_progress is missing`);
    assert.notEqual(atBorder, inProgress, `${lang}: at_border must not collapse into the in_progress label`);
  }
  assert.equal(keyValue(blocks.RU, 'deal_status_at_border'), 'На границе');
  assert.equal(keyValue(blocks.ZH, 'deal_status_at_border'), '在边境');
});

test('deal_event_status_completed exists in ZH with completion semantics (no RU fallback)', () => {
  for (const lang of LOCALES) {
    const completed = keyValue(blocks[lang], 'deal_event_status_completed');
    assert.ok(completed, `${lang}: deal_event_status_completed is missing`);
    assert.ok(!/deal_event_status_completed/.test(completed), `${lang}: completed must not fall back to the raw key`);
  }
  // ZH mirrors the RU «Завершён» semantics (已完成/交易已完成).
  const zh = keyValue(blocks.ZH, 'deal_event_status_completed');
  assert.ok(zh.includes('已完成'), `ZH completed must read as deal-completed, got: ${zh}`);
  const ru = keyValue(blocks.RU, 'deal_event_status_completed');
  assert.ok(/[Зз]аверш/.test(ru), `RU completed must read as deal-completed, got: ${ru}`);
});

test('received and completed event labels differ in every locale', () => {
  for (const lang of LOCALES) {
    const received = keyValue(blocks[lang], 'deal_event_status_received');
    const completed = keyValue(blocks[lang], 'deal_event_status_completed');
    assert.ok(received, `${lang}: deal_event_status_received is missing`);
    assert.notEqual(received, completed, `${lang}: received and completed must describe different states`);
  }
});

test('list labels status_completed / status_received exist in all four locales', () => {
  for (const lang of LOCALES) {
    assert.ok(keyValue(blocks[lang], 'status_completed'), `${lang}: status_completed missing`);
    assert.ok(keyValue(blocks[lang], 'status_received'), `${lang}: status_received missing`);
  }
  assert.equal(keyValue(blocks.ZH, 'status_completed'), '已完成');
  assert.equal(keyValue(blocks.RU, 'status_completed'), 'Завершён');
});

test('deals list maps at_border to its dedicated label (no in_progress collapse)', () => {
  const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');
  assert.match(deals, /if \(status === "at_border"\) \{\s*return \{ label: t\("deal_status_at_border"\), color: AT_BORDER \};/);
  assert.match(deals, /const AT_BORDER = "#B45800"/);
  assert.doesNotMatch(deals, /status === "in_progress" \|\| status === "at_border"/);
});

test('deals list deal cards carry the real deal number under the price', () => {
  const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');
  assert.match(deals, /priceMeta=\{data\.id \? `\$\{t\('deal_no'\)\} \$\{data\.id\}` : null\}/);
});

test('deal_no exists in all four locales for the deal-number line', () => {
  for (const lang of LOCALES) {
    const dealNo = keyValue(blocks[lang], 'deal_no');
    assert.ok(dealNo, `${lang}: deal_no is missing`);
    assert.ok(/№/.test(dealNo), `${lang}: deal_no must carry the number sign`);
  }
});
