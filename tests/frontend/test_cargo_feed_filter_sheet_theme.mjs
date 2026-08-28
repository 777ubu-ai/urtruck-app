// P1 (27.08.2026, owner ТЗ): CargoFeedScreen's filter/sort bottom-sheet
// elements (date/body/price filters) were rendered with ONLY the static
// StyleSheet colors (SURFACE='#FFFFFF', BORDER='#E5EAE7', TEXT_SECONDARY=
// '#606B66') and no inline theme override — the one thing the earlier
// "make cargo feed follow theme" fix (c0796ae) missed. BottomSheet itself
// IS theme-aware (components/ui/v1/BottomSheet.js), so in dark mode this
// produced exactly the "light card floating inside a dark sheet" symptom:
// solid-white filter buttons/chips inside an otherwise-dark filter sheet.
//
// This mirrors the same false-negative class as the earlier P1-007 fix
// (qa/utils/themeSmoke.js Section 6): a near-miss hardcoded literal that
// the static heuristic didn't catch because it's assigned to a module-
// level const first, not typed as a literal at the JSX call site. Static
// scanning can't fully close this class — this contract test locks the
// concrete fix instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');

test('date filter sheet: reset button and labels carry an inline palette override', () => {
  assert.match(src, /styles\.sheetLabel, \{ color: palette\.textMuted \}/);
  assert.match(src, /styles\.sheetSecondary, \{ backgroundColor: palette\.surface, borderColor: palette\.border \}/);
  assert.match(src, /styles\.sheetSecondaryText, \{ color: palette\.textSecondary \}/);
});

test('body-type filter chips (bodyChip) carry an inline palette override at every render site', () => {
  const matches = src.match(/styles\.bodyChip, \{ backgroundColor: palette\.surface, borderColor: palette\.border \}/g) || [];
  // One for the "all" chip + one for the TRUCK_KEYS.map(...) chip — both
  // sites must be covered, not just the first.
  assert.ok(matches.length >= 2, `expected >= 2 themed bodyChip render sites, got ${matches.length}`);
  assert.match(src, /styles\.bodyChipText, \{ color: palette\.textSecondary \}/);
});

test('sort rows (sortRow) carry an inline palette override', () => {
  assert.match(src, /styles\.sortRow, \{ backgroundColor: palette\.surface, borderColor: palette\.border \}/);
  assert.match(src, /styles\.sortText, \{ color: palette\.textSecondary \}/);
});

test('all three sheetSecondary usage sites (date/body/price filters) are themed, not just the first', () => {
  const matches = src.match(/styles\.sheetSecondary, \{ backgroundColor: palette\.surface, borderColor: palette\.border \}/g) || [];
  assert.equal(matches.length, 3, `expected exactly 3 themed sheetSecondary sites (date, body, price filters), got ${matches.length}`);
});

test('the raw SURFACE/BORDER/TEXT module consts still exist as StyleSheet base values (fallback only, not a live bug by themselves — the bug was missing override at the call site)', () => {
  // This isn't asserting the consts are gone (they're legitimate static
  // defaults) — it documents that they must NEVER be relied on bare at a
  // JSX call site without a palette override alongside them.
  assert.match(src, /const SURFACE = '#FFFFFF';/);
  assert.match(src, /const BORDER = '#E5EAE7';/);
});
