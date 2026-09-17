import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { routeMetricValues } from '../../src/utils/routeMetricValues.js';

test('нет GPS: общий маршрут не превращается в остаток и прогресс 0%', () => {
  const v = routeMetricValues({ distanceText: '200 km', durationText: '3 h', isRemaining: false }, false);
  assert.equal(v.total, '200 km');
  assert.equal(v.estimatedTime, '—');
  assert.equal(v.totalTravelTime, '3 h');
  assert.equal(v.remaining, '—');
  assert.equal(v.progress, null);
  assert.equal(v.eta, '—');
});

test('свежая точка показывает нулевой остаток; stale скрывает текущие метрики', () => {
  const summary = { totalDistanceText: '200 km', totalDurationText: '3 h', distanceText: '0 km', passedDistanceText: '200 km', progressPercent: 100, isRemaining: true };
  assert.equal(routeMetricValues(summary, true).remaining, '0 km');
  assert.equal(routeMetricValues(summary, true).progress, 100);
  assert.equal(routeMetricValues(summary, false).remaining, '—');
  assert.equal(routeMetricValues(summary, false).passed, '—');
  assert.equal(routeMetricValues({ ...summary, blocked: true }, true).total, '—');
});

test('чистое время движения не смешивается с отдыхом', () => {
  const value = routeMetricValues({ totalDurationText: '39 h', drivingDurationText: '24 h' }, false);
  assert.equal(value.estimatedTime, '24 h');
  assert.equal(value.totalTravelTime, '39 h');
  assert.equal(value.eta, '—');
});

test('native/web не превращают null/пустые координаты в 0,0', () => {
  for (const name of ['native', 'web']) {
    const source = readFileSync(`src/components/TruckMap.${name}.js`, 'utf8');
    const start = source.indexOf('const asPoint =');
    const end = source.indexOf('\n};', start) + 3;
    const point = vm.runInNewContext(source.slice(start, end) + '\nasPoint;');
    for (const invalid of [[null, null], ['', ''], [91, 10], [0, 181], { lat: null, lng: 0 }]) {
      assert.equal(point(invalid), null);
    }
    assert.ok(point([0, 0]));
  }
});

test('ETA не использует обещанную дату доставки; unknown progress не рисует 0%', () => {
  const screen = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(screen, /value: metrics\.eta/);
  assert.match(screen, /progress=\{metrics\.progress\}/);
  const sheet = readFileSync('src/components/deal/TripMapInfoSheet.js', 'utf8');
  assert.match(sheet, /safeProgress === null \? '—'/);
});
