import test from 'node:test';
import assert from 'node:assert/strict';
import { cargoDisplay, normalizeCargo, parseWeightTonsInput } from '../../src/utils/normalizers.js';
import { readFileSync } from 'node:fs';

const t = (key) => ({ ton: 'т', volume: 'м³', not_specified: 'Не указано' }[key] || key);

test('cargo weight stays in tonnes end to end and formats large values readably', () => {
  const cargo = normalizeCargo({ weight_tons: 20000 }, 'RU');
  assert.equal(cargo.weightTons, 20000);
  assert.equal(cargoDisplay(cargo, t, 'RU').weight, '20 000 т');
});

test('fractional cargo weight keeps its value and locale decimal separator', () => {
  assert.equal(cargoDisplay(normalizeCargo({ weight_tons: 20.5 }), t, 'RU').weight, '20,5 т');
  assert.equal(cargoDisplay(normalizeCargo({ weight_tons: 20.5 }), t, 'EN').weight, '20.5 t');
});

test('legacy string weights are displayed as stored without a guessed kg conversion', () => {
  assert.equal(cargoDisplay(normalizeCargo({ weight_tons: '20000' }), t, 'EN').weight, '20,000 t');
  assert.equal(cargoDisplay(normalizeCargo({ weight_tons: '20,000' }), t, 'EN').weight, '20,000 t');
});

test('cargo create and edit parse decimal comma and point as tonnes', () => {
  assert.equal(parseWeightTonsInput('20,5'), 20.5);
  assert.equal(parseWeightTonsInput('20.5'), 20.5);
  assert.equal(parseWeightTonsInput('20 000,5'), 20000.5);
  assert.equal(parseWeightTonsInput(''), null);
  assert.equal(parseWeightTonsInput('20,5 kg'), null);
  assert.equal(parseWeightTonsInput('-1'), -1);

  const create = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
  const edit = readFileSync('src/components/EditCargoModal.js', 'utf8');
  assert.match(create, /const wNum = parseWeightTonsInput\(tons\)/);
  assert.match(create, /weight_tons: wNum \?\? 0/);
  assert.match(edit, /parseWeightTonsInput\(weight\)/);
});
