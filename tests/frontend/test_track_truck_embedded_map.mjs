import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../../src/screens/TrackTruckScreen.js'), 'utf8');

test('live-GPS остаётся во встроенной карте и не открывает внешние карты', () => {
  assert.match(source, /import TruckMap from '..\/components\/TruckMap';/);
  assert.match(source, /<TruckMap lat=\{lat\} lng=\{lng\}/);
  assert.doesNotMatch(source, /Linking\.openURL/);
  assert.doesNotMatch(source, /track-open-maps/);
});
