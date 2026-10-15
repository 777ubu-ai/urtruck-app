import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareChatPhoto, CHAT_PHOTO_MAX_BYTES } from '../../src/utils/prepareChatPhoto.js';

test('PNG and HEIC converted to JPEG carry matching filename and MIME', async () => {
  for (const name of ['погрузка.png', 'invoice.HEIC', '照片.jpeg']) {
    const calls = [];
    const result = await prepareChatPhoto({ uri: 'file://source', name }, {
      compressImage: async (uri, options) => { calls.push({ uri, options }); return 'file://compressed.jpg'; },
      readByteSize: async () => 500000,
    });
    assert.equal(result.type, 'image/jpeg');
    assert.ok(result.name.endsWith('.jpg'));
    assert.equal(result.uri, 'file://compressed.jpg');
    assert.equal(result.size, 500000);
    assert.equal(calls[0].options.strict, true);
  }
});

test('failed compression does not produce an original-file upload payload', async () => {
  let sizeRead = false;
  await assert.rejects(prepareChatPhoto({ uri: 'file://huge-original.heic' }, {
    compressImage: async () => { throw new Error('decoder failed'); },
    readByteSize: async () => { sizeRead = true; return 100; },
  }), error => error.code === 'photo_preparation_failed');
  assert.equal(sizeRead, false);
});

test('unreadable output and unknown or empty size stop preparation', async () => {
  for (const size of [null, undefined, NaN, 0, -1]) {
    await assert.rejects(prepareChatPhoto({ uri: 'file://source' }, {
      compressImage: async () => 'file://compressed.jpg', readByteSize: async () => size,
    }), error => error.code === 'photo_preparation_failed');
  }
});

test('compressed size, not original picker size, controls the photo limit', async () => {
  const deps = { compressImage: async () => 'file://compressed.jpg', readByteSize: async () => CHAT_PHOTO_MAX_BYTES };
  assert.equal((await prepareChatPhoto({ uri: 'file://large-original' }, deps)).size, CHAT_PHOTO_MAX_BYTES);
  await assert.rejects(prepareChatPhoto({ uri: 'file://source' }, {
    ...deps, readByteSize: async () => CHAT_PHOTO_MAX_BYTES + 1,
  }), error => error.code === 'photo_too_large' && error.status === 413);
});
