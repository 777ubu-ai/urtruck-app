import test from 'node:test';
import assert from 'node:assert/strict';

import { createPdfPreviewCallbacks } from '../../src/components/deal/pdfPreviewCallbacks.js';

test('native renderer reports page content only after valid metadata and page callback', () => {
  const events = [];
  const callbacks = createPdfPreviewCallbacks({
    onMetadata: (value) => events.push(['metadata', value]),
    onRendered: (value) => events.push(['rendered', value]),
    onError: (value) => events.push(['error', value]),
  });
  callbacks.onLoadComplete(2, '/cache/document.pdf', { width: 612, height: 792 });
  callbacks.onPageChanged(1, 2);
  assert.deepEqual(events, [
    ['metadata', { pages: 2, width: 612, height: 792 }],
    ['rendered', { page: 1, pages: 2 }],
  ]);
});

test('invalid/white-page geometry is an error, never a rendered success', () => {
  const events = [];
  const callbacks = createPdfPreviewCallbacks({
    onRendered: (value) => events.push(['rendered', value]),
    onError: (value) => events.push(['error', value]),
  });
  callbacks.onLoadComplete(1, '/cache/document.pdf', { width: 0, height: 0 });
  callbacks.onPageChanged(0, 1);
  assert.deepEqual(events, [
    ['error', 'invalid_page_geometry'],
    ['error', 'invalid_page_index'],
  ]);
});
