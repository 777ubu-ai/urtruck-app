import test from 'node:test';
import assert from 'node:assert/strict';
import { fitImageDimensions } from '../../src/utils/imageDimensions.js';

test('фото документа в портретной ориентации ограничивается длинной стороной', () => {
  assert.deepEqual(fitImageDimensions(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitImageDimensions(4000, 3000, 1600), { width: 1600, height: 1200 });
});

test('маленькое изображение не увеличивается, пропорции сохраняются', () => {
  assert.deepEqual(fitImageDimensions(240, 320, 1600), { width: 240, height: 320 });
  assert.deepEqual(fitImageDimensions(8000, 100, 1600), { width: 1600, height: 20 });
});

test('некорректные размеры отклоняются до обработки фото', () => {
  for (const width of [0, -1, NaN, Infinity]) assert.throws(() => fitImageDimensions(width, 100, 1600));
});
