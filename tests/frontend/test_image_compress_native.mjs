import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dimensions = `data:text/javascript;base64,${Buffer.from(fs.readFileSync('src/utils/imageDimensions.js')).toString('base64')}`;
let source = fs.readFileSync('src/utils/imageCompress.js', 'utf8')
  .replace("import { Image as NativeImage, Platform } from 'react-native';", "const Platform = { OS: 'ios' }; const NativeImage = { getSize: (uri, ok) => ok(4000, 3000) };")
  .replace("'./imageDimensions'", JSON.stringify(dimensions))
  .replace("await import('expo-image-manipulator')", "{ manipulateAsync: (...args) => globalThis.__photoManipulate(...args), SaveFormat: { JPEG: 'jpeg' } }")
  .replaceAll("await import('expo-file-system')", "{ File: class { constructor(uri) { this.exists = true; this.size = 500000; } } }");
const { compressImage, imageUploadByteSize } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('native compression failure throws in chat strict mode, preserves older caller fallback', async () => {
  globalThis.__photoManipulate = async () => { throw new Error('decoder unavailable'); };
  await assert.rejects(compressImage('file://original.heic', { strict: true }), error => error.code === 'photo_preparation_failed');
  assert.equal(await compressImage('file://original.heic'), 'file://original.heic');
});

test('native strict preparation requests JPEG and fits long side; modern File API reads size', async () => {
  let received;
  globalThis.__photoManipulate = async (...args) => { received = args; return { uri: 'file://resized.jpg' }; };
  assert.equal(await compressImage('file://source.png', { strict: true, preset: 'chat' }), 'file://resized.jpg');
  assert.equal(received[2].format, 'jpeg');
  assert.deepEqual(received[1], [{ resize: { width: 1600, height: 1200 } }]);
  assert.equal(await imageUploadByteSize('file://resized.jpg'), 500000);
});
