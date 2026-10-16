import test from 'node:test';
import assert from 'node:assert/strict';
import { createPickerSearchScheduler } from '../../src/utils/pickerSearchScheduler.js';

function clock() {
  const tasks = new Map();
  let id = 0;
  return {
    tasks,
    scheduleTimer(fn, delay) { tasks.set(++id, { fn, delay }); return id; },
    cancelTimer(key) { tasks.delete(key); },
    flush() { const batch = [...tasks.values()]; tasks.clear(); batch.forEach(({ fn }) => fn()); },
  };
}
test('rapid input commits only the last query after 250ms', () => {
  const time = clock();
  const scheduler = createPickerSearchScheduler(time);
  const results = [];
  for (const q of ['А', 'Ал', 'Алм', 'Алматы']) scheduler.schedule(q, (v) => results.push(v));
  assert.equal(time.tasks.size, 1);
  assert.equal([...time.tasks.values()][0].delay, 250);
  assert.deepEqual(results, []);
  time.flush();
  assert.deepEqual(results, ['Алматы']);
});
test('close/clear cancels work and a late cancelled callback is ignored', () => {
  const time = clock();
  const scheduler = createPickerSearchScheduler(time);
  const results = [];
  scheduler.schedule('北京', (v) => results.push(v));
  const stale = [...time.tasks.values()][0].fn;
  scheduler.cancel();
  stale();
  time.flush();
  assert.deepEqual(results, []);
});
test('country and locale changes invalidate earlier search contexts', () => {
  const time = clock();
  const scheduler = createPickerSearchScheduler(time);
  const results = [];
  scheduler.schedule('Berlin:FR:RU', (v) => results.push(v));
  const stale = [...time.tasks.values()][0].fn;
  scheduler.schedule('Berlin:DE:ZH', (v) => results.push(v));
  stale();
  time.flush();
  assert.deepEqual(results, ['Berlin:DE:ZH']);
});
