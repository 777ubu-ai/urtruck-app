import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePrivateImage, sweepPrivateImageEntries, PRIVATE_IMAGE_PREFIX } from '../../src/utils/privateImageCache.js';

test('фото сохраняется только во временный cache и удаляется один раз', () => {
  let created, deleted = 0, written;
  class FakeFile {
    constructor(root, name) { assert.equal(root, 'cache-root'); this.uri = `file:///cache/${name}`; this.exists = false; }
    create(options) { assert.equal(options.overwrite, false); this.exists = true; created = this; }
    write(value) { written = Array.from(value); }
    delete() { deleted++; this.exists = false; }
  }
  const file = stagePrivateImage({ FileClass: FakeFile, cacheRoot: 'cache-root', bytes: new Uint8Array([1, 2]).buffer, mime: 'image/jpeg', nonce: 'run-1' });
  assert.ok(file.uri.includes(`${PRIVATE_IMAGE_PREFIX}run-1.jpg`));
  assert.deepEqual(written, [1, 2]);
  file.dispose(); file.dispose();
  assert.equal(deleted, 1);
  assert.equal(created.exists, false);
});

test('неизвестный MIME и столкновение имён не удаляют существующий файл', () => {
  let deleted = 0;
  class ExistingFile {
    constructor() { this.exists = true; }
    create() { throw new Error('already_exists'); }
    delete() { deleted++; }
  }
  assert.throws(() => stagePrivateImage({ FileClass: ExistingFile, cacheRoot: 'cache', bytes: new ArrayBuffer(1), mime: 'image/svg+xml', nonce: 'x' }), /invalid_image_type/);
  assert.throws(() => stagePrivateImage({ FileClass: ExistingFile, cacheRoot: 'cache', bytes: new ArrayBuffer(1), mime: 'image/png', nonce: 'x' }), /already_exists/);
  assert.equal(deleted, 0);
});

test('частично записанный временный файл удаляется при ошибке записи', () => {
  let deleted = 0;
  class FailedFile {
    constructor() { this.exists = false; }
    create() { this.exists = true; }
    write() { throw new Error('disk_error'); }
    delete() { deleted++; this.exists = false; }
  }
  assert.throws(() => stagePrivateImage({ FileClass: FailedFile, cacheRoot: 'cache', bytes: new ArrayBuffer(1), mime: 'image/png', nonce: 'x' }), /disk_error/);
  assert.equal(deleted, 1);
});

test('очистка выбирает только собственные временные изображения', () => {
  const removed = [];
  const entries = [
    { name: `${PRIVATE_IMAGE_PREFIX}old.jpg`, uri: 'file:///cache/old.jpg' },
    { name: 'user-photo.jpg', uri: 'file:///cache/user-photo.jpg' },
    { name: `${PRIVATE_IMAGE_PREFIX}other.pdf`, uri: 'file:///cache/other.pdf' },
  ];
  assert.equal(sweepPrivateImageEntries(entries, uri => { removed.push(uri); return true; }), 1);
  assert.deepEqual(removed, ['file:///cache/old.jpg']);
});
