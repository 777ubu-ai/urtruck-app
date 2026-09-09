// Design v1 Commit 6 — registration flow: one visual family + defect fixes.
// Source-level (gray-box) contract, same style as the other design_* tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const citizenship = readFileSync('src/screens/registration/CitizenshipScreen.js', 'utf8');
const identity = readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
const dobSheet = readFileSync('src/components/DateOfBirthSheet.js', 'utf8');

// CitizenshipScreen migrated from ThemeContext hardcodes (#168759 accent,
// theme.card/theme.border fills) to the same brandV2 token family as
// IdentityStepScreen / VehicleDocsScreen / TruckParamsScreen.
test('CitizenshipScreen uses the brandV2 token family (no ThemeContext hardcodes)', () => {
  assert.match(citizenship, /from '\.\.\/\.\.\/theme\/brandV2'/, 'must import brandV2 tokens');
  assert.match(citizenship, /\bbrand,\s*radius,\s*typography\b/, 'must use brand/radius/typography');
  assert.doesNotMatch(citizenship, /ThemeContext/, 'ThemeContext hardcodes must be gone');
  assert.doesNotMatch(citizenship, /#168759/, 'accent must come from brand.primary, not a hex literal');
  assert.doesNotMatch(citizenship, /\btheme\./, 'no theme.* color lookups remain');
  // IdentityStepScreen idioms: shared BackButton + KeyboardSafeLayout.
  assert.match(citizenship, /BackButton/);
  assert.match(citizenship, /KeyboardSafeLayout/);
  assert.match(citizenship, /KeyboardSafeScrollView/);
});

test('CitizenshipScreen keeps registration behavior and testIDs unchanged', () => {
  assert.match(citizenship, /regAPI\.saveDriverDraft\(\{\s*citizenship_country:\s*selected\s*\}\)/);
  assert.match(citizenship, /navigation\.navigate\('Identity',\s*\{\s*citizenship:\s*selected\s*\}\)/);
  assert.match(citizenship, /testID="citizenship-back"/);
  assert.match(citizenship, /testID="citizenship-continue"/);
  assert.match(citizenship, /testID=\{`citizenship-\$\{c\.code\}`\}/);
  for (const code of ['KZ', 'RU', 'UZ', 'KG', 'TJ', 'other']) {
    assert.match(citizenship, new RegExp(`code:\\s*'${code}'`));
  }
});

// List rows: 56h, radius 14, selected = accent soft bg (primarySoft) + check.
test('CitizenshipScreen option rows follow the flow idiom (56h / radius 14 / soft-selected)', () => {
  assert.match(citizenship, /minHeight:\s*56/);
  assert.match(citizenship, /borderRadius:\s*14/);
  assert.match(citizenship, /optionActive:[^}]*borderColor:\s*brand\.primary[^}]*backgroundColor:\s*brand\.primarySoft/);
  assert.match(citizenship, /check-circle/);
  // CTA matches the IdentityStepScreen footer idiom (56h, brand.primary).
  assert.match(citizenship, /cta:[^}]*height:\s*56[^}]*backgroundColor:\s*brand\.primary/);
});

// Upload slots in IdentityStepScreen: 120×120 square → 4:3 aspect.
test('IdentityStepScreen document upload slots are 4:3, not 120x120 squares', () => {
  assert.match(identity, /photoSlot:[^}]*aspectRatio:\s*4\s*\/\s*3/);
  assert.doesNotMatch(identity, /photoSlot:[^}]*width:\s*120/);
  assert.doesNotMatch(identity, /height:\s*120/);
  // Cover/quality behavior untouched.
  assert.match(identity, /resizeMode="cover"/);
  assert.match(identity, /quality:\s*0\.85/);
  assert.match(identity, /pickIdSide/);
});

// DOB sheet defect fix: the picker columns had a dead ScrollView ref —
// selected day/month/year was never scrolled into view on open.
test('DateOfBirthSheet scrolls the selected value into view (dead ref fixed)', () => {
  assert.match(dobSheet, /const Column = \(\{ data, value, onSelect, render, testID \}\)/,
    'Column must be a stable module-level component (was a per-render closure)');
  assert.match(dobSheet, /ref\.current\?\.scrollTo\?\.\(\{\s*y/);
  assert.match(dobSheet, /scrollToValue/);
  assert.match(dobSheet, /useEffect\(\(\) => \{\s*scrollToValue\(value\)/);
});
