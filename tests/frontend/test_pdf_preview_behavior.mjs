import test from 'node:test';
import assert from 'node:assert/strict';

import { createPdfPreviewCallbacks } from '../../src/components/deal/pdfPreviewCallbacks.js';
import {
  deletePrivatePdfCachePath,
  isPrivatePdfCachePath,
} from '../../src/components/deal/privatePdfCache.js';

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

test('native renderer exposes its private cache path for cleanup', () => {
  const cached = [];
  const callbacks = createPdfPreviewCallbacks({ onCacheFile: (path) => cached.push(path) });
  callbacks.onLoadComplete(1, 'file:///data/user/0/com.urtruck.app.qa2/cache/secret.pdf', { width: 1, height: 1 });
  assert.deepEqual(cached, ['file:///data/user/0/com.urtruck.app.qa2/cache/secret.pdf']);
});

test('private PDF cleanup deletes only files below the app cache root', () => {
  const deleted = [];
  const createFile = (path) => ({ exists: true, delete: () => deleted.push(path) });
  const cacheUri = 'file:///data/user/0/com.urtruck.app.qa2/cache/';
  const privatePath = 'file:///data/user/0/com.urtruck.app.qa2/cache/react-native-pdf/secret.pdf';
  const externalPath = 'file:///data/user/0/com.urtruck.app.qa2/files/keep.pdf';

  assert.equal(isPrivatePdfCachePath(privatePath, cacheUri), true);
  assert.equal(deletePrivatePdfCachePath(privatePath, { cacheUri, createFile }), true);
  assert.equal(deletePrivatePdfCachePath(externalPath, { cacheUri, createFile }), false);
  assert.deepEqual(deleted, [privatePath]);
});
