import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/components/EditCargoModal.js', 'utf8');
const ceramic = await import('../../src/theme/designV1Palette.js');
const legacy = vm.runInNewContext(fs.readFileSync('src/utils/theme.js', 'utf8')
  .replace(/import .*?;\n/g, '')
  .replace(/export const /g, 'const ') + '\n({ lightTheme, darkTheme })', { Platform: { OS: 'android' } });
const selection = source.match(/const theme = ([^;]+);/)[1];
const backgroundFor = (name, theme) => {
  const expression = source.match(new RegExp('s\\.' + name + ', \\{ backgroundColor: ([^,}]+)'))?.[1];
  assert.ok(expression, `${name}: background expression exists`);
  return vm.runInNewContext(expression, { theme });
};

for (const dark of [false, true]) {
  for (const role of ['client', 'driver']) {
    test(`edit cargo: opaque sheet and save background, ${role}, dark=${dark}`, () => {
      const shipper = dark ? ceramic.SHIPPER_CERAMIC_DARK : ceramic.SHIPPER_CERAMIC;
      const baseTheme = dark ? legacy.darkTheme : legacy.lightTheme;
      const theme = vm.runInNewContext(selection, { role, shipper, baseTheme });
      const sheet = backgroundFor('sheet', theme);
      assert.match(sheet || '', /^#[0-9a-f]{6}$/i, 'sheet must have an opaque palette color');
      assert.equal(sheet, role === 'driver' ? baseTheme.cardElevated : shipper.surface);
      assert.match(backgroundFor('save', theme) || '', /^#[0-9a-f]{6}$/i);
    });
  }
}
