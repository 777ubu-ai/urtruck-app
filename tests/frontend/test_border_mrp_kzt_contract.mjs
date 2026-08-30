import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, '../../src/screens/QueueScreenLazyV2.js'), 'utf8');

test('border calendar exposes exact 2026 MRP value in tenge', () => {
  assert.match(source, /const MCI_KZT_2026 = 4325;/);
  assert.match(source, /function formatKztAmount\(mci\)/);
  assert.match(source, /\* MCI_KZT_2026/);
});

test('1 MRP and 100 MRP calendar cards show their tenge amounts under the MRP label', () => {
  assert.match(source, /\{formatKztAmount\(1\)\}/);
  assert.match(source, /\{formatKztAmount\(100\)\}/);
  assert.match(source, /dateAmount: \{ fontSize: 8\.5/);
  assert.match(source, /dateCard: \{ width: 90, minHeight: 101/);
});

test('2026 MRP arithmetic yields the approved exact amounts', () => {
  const mci = 4325;
  const format = (count) => `${count * mci}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
  assert.equal(format(1), '4 325 ₸');
  assert.equal(format(100), '432 500 ₸');
});
