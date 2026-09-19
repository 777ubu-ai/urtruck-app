import test from 'node:test';
import assert from 'node:assert/strict';
import { routeProgress } from '../../src/utils/routeProgress.js';
import { routeMetricNumbers } from '../../src/utils/routeMetricNumbers.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('разреженная полилиния: середина сегмента даёт половину пути', () => {
  const p = routeProgress([[0, 0], [0, 2]], [0, 1]);
  assert.equal(p.matched, true);
  assert.ok(Math.abs(p.passedMeters / p.totalMeters - 0.5) < 1e-8);
  assert.ok(p.progressPercent >= 49 && p.progressPercent <= 50);
  assert.ok(Math.abs(p.totalMeters - p.passedMeters - p.remainingMeters) < 1e-6);
});

test('добавление вершин прямой дороги не меняет пробег', () => {
  const sparse = routeProgress([[0, 0], [0, 2]], [0, 0.7]);
  const dense = routeProgress([[0, 0], [0, 0.5], [0, 1], [0, 1.5], [0, 2]], [0, 0.7]);
  assert.ok(Math.abs(sparse.passedMeters - dense.passedMeters) < 0.01);
});

test('съезд с маршрута и отсутствующие координаты не выдают fake 0/100%', () => {
  assert.equal(routeProgress([[0, 0], [0, 2]], [1, 1]).reason, 'off_route');
  for (const point of [null, [null, null], ['', ''], [91, 0]]) {
    const p = routeProgress([[0, 0], [0, 2]], point);
    assert.equal(p.progressPercent, null);
    assert.equal(p.remainingMeters, null);
  }
});

test('петля и пересечение не выбирают случайный ранний/поздний проезд', () => {
  const loop = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
  assert.equal(routeProgress(loop, [0, 0]).reason, 'ambiguous');
  const crossing = [[-0.01, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, -0.01]];
  assert.equal(routeProgress(crossing, [0, 0]).reason, 'ambiguous');
});

test('небольшой GPS шум на обычной дороге не вызывает скачок на вершину', () => {
  const route = [[0, 0], [0, 2]];
  const a = routeProgress(route, [0.0001, 0.99999]);
  const b = routeProgress(route, [-0.0001, 1.00001]);
  assert.equal(a.matched, true);
  assert.equal(b.matched, true);
  assert.ok(Math.abs(a.passedMeters - b.passedMeters) < 3);
});

test('антимеридиан, повторные вершины и конечная точка', () => {
  const p = routeProgress([[0, 179], [0, 179], [0, -179]], [0, 180]);
  assert.equal(p.matched, true);
  assert.ok(Math.abs(p.passedMeters / p.totalMeters - 0.5) < 1e-8);
  const end = routeProgress([[0, 0], [0, 1]], [0, 1]);
  assert.equal(end.progressPercent, 100);
  assert.equal(end.remainingMeters, 0);
  assert.equal(routeProgress([[0, 0], [null, 1], [0, 2]], [0, 1]).reason, 'invalid_geometry');
});

test('provider distance согласует общий путь, остаток и пройдено', () => {
  const p = routeProgress([[0, 0], [0, 2]], [0, 1]);
  const m = routeMetricNumbers({ distance_m: 300000, duration_s: 18000, driving_duration_s: 12000 }, p);
  assert.ok(Math.abs(m.passedMeters - 150000) < 0.01);
  assert.ok(Math.abs(m.remainingMeters - 150000) < 0.01);
  assert.equal(m.totalMeters, m.passedMeters + m.remainingMeters);
  assert.equal(m.drivingDurationSeconds, 12000);
  assert.equal(m.totalDurationSeconds, 18000);
  const off = routeMetricNumbers({ distance_m: 300000 }, routeProgress([[0, 0], [0, 2]], [1, 1]));
  assert.equal(off.totalMeters, 300000);
  assert.equal(off.remainingMeters, null);
  assert.equal(off.isRemaining, false);
});

test('web effect пересчитывает метрики при новой GPS точке без смены маршрута', () => {
  const source = readFileSync('src/components/TruckMap.web.js', 'utf8');
  const helpers = source.slice(source.indexOf('const asPoint ='), source.indexOf('function StaticRouteFallback'));
  const start = source.indexOf('function YandexMap(');
  const body = source.slice(start, source.indexOf('\n  return (\n    <View', start)) + '\nreturn null;\n}';
  const render = point => {
    const effects = [], results = [];
    const sandbox = {
      routeProgress, routeMetricNumbers,
      React: { useRef: () => ({ current: null }), useState: x => [x === 'loading' ? 'ready' : x, () => {}], useEffect: (fn, deps) => effects.push({ fn, deps }) },
      useI18n: () => ({ t: key => key, lang: 'en' }),
    };
    vm.runInNewContext(helpers + body + '\nglobalThis.render = YandexMap;', sandbox);
    sandbox.render({ livePoint: point, plannedPoints: [[0, 0], [0, 2]], serverRoute: { geometry: [[0, 0], [0, 2]], distance_m: 200000, duration_s: 18000, driving_duration_s: 12000 }, onRouteSummary: s => results.push(s) });
    const summaryEffect = effects.find(e => e.fn.toString().includes('routeMetricNumbers'));
    assert.ok(summaryEffect);
    assert.ok(summaryEffect.deps.includes(point.join(':')));
    summaryEffect.fn();
    return results[0];
  };
  const first = render([0, 0.5]), second = render([0, 1.5]);
  assert.equal(first.isRemaining, true);
  assert.equal(second.isRemaining, true);
  assert.notEqual(first.distanceText, second.distanceText);
  assert.ok(first.progressPercent < second.progressPercent);
});
