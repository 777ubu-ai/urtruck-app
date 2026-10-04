import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync('src/components/EditCargoModal.js', 'utf8');
const palette = readFileSync('src/theme/designV1Palette.js', 'utf8');

test('client cargo edit sheet always resolves to an opaque theme surface', () => {
  assert.match(
    modal,
    /const sheetBackground = theme\.cardElevated \|\| theme\.card \|\| theme\.surface \|\| theme\.bg \|\| '#FFFFFF';/,
  );
  assert.match(modal, /style=\{\[s\.sheet, \{ backgroundColor: sheetBackground \}\]\}/);
  assert.match(palette, /export const SHIPPER_CERAMIC = \{[\s\S]*?surface: '#FFFFFF'/);
  assert.doesNotMatch(
    modal,
    /backgroundColor: theme\.cardElevated \|\| theme\.card \}\]/,
    'Ceramic palettes do not expose legacy card tokens; using only those makes the sheet transparent',
  );
});

test('edit cargo remains one bounded scrollable sheet', () => {
  assert.match(modal, /sheet: \{[^\n]*maxHeight: '88%'/);
  assert.match(modal, /<KeyboardSafeScrollView[\s\S]*contentContainerStyle=/);
  assert.match(modal, /testID="edit-cargo-price"/);
  assert.match(modal, /testID="edit-cargo-desc"/);
  assert.match(modal, /testID="edit-cargo-weight"/);
  assert.match(modal, /testID="edit-cargo-volume"/);
  assert.match(modal, /testID="edit-cargo-save"/);
});
