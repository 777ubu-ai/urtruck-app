import test from 'node:test';
import assert from 'node:assert/strict';

import {
  safeNativeUploadName,
  sweepStaleNativeUploads,
  withNativeUploadFile,
} from '../../src/utils/nativeAttachmentStaging.js';

function fakeFs() {
  const files = new Map();
  const directories = new Map();
  class Directory {
    constructor(root, child) {
      this.uri = child ? `${root.uri || root}/${child}` : (root.uri || root);
      this.name = this.uri.split('/').pop();
    }
    get exists() { return directories.has(this.uri); }
    create() { directories.set(this.uri, { deleted: false, modified: Date.now() }); }
    delete() { directories.get(this.uri).deleted = true; }
    info() { return { modificationTime: directories.get(this.uri)?.modified }; }
    list() {
      return [...directories.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`) && !directories.get(uri).deleted)
        .map((uri) => new Directory(uri));
    }
  }
  class File {
    constructor(root, child) {
      this.uri = child ? `${root.uri}/${child}` : root;
      this.name = this.uri.split('/').pop();
    }
    async copy(destination) { files.set(destination.uri, files.get(this.uri)); }
    get bytes() { return files.get(this.uri); }
  }
  directories.set('cache://root', { deleted: false, modified: Date.now() });
  return { Directory, File, files, directories, cacheRoot: 'cache://root' };
}

test('multipart staging preserves ASCII/Unicode names and exact bytes', async () => {
  for (const name of ['qa2-controlled-cmr.pdf', 'накладная-义乌.pdf']) {
    const fs = fakeFs();
    fs.files.set('content://picked/uuid', Uint8Array.from([37, 80, 68, 70, 45, 49]));
    const parts = [];
    const form = { append: (...args) => parts.push(args) };
    const result = await withNativeUploadFile(form, 'content://picked/uuid', name, async () => 'sent', {
      ...fs,
      now: 1000,
      random: () => 0.5,
    });
    assert.equal(result, 'sent');
    assert.equal(parts[0][1].name, name.normalize('NFC'));
    assert.deepEqual(parts[0][1].bytes, Uint8Array.from([37, 80, 68, 70, 45, 49]));
    assert.equal([...fs.directories.values()].some((row) => row.deleted), true);
  }
});

test('staging directory is removed when upload fails', async () => {
  const fs = fakeFs();
  fs.files.set('content://picked/file', Uint8Array.from([1, 2, 3]));
  await assert.rejects(
    withNativeUploadFile({ append() {} }, 'content://picked/file', 'file.pdf', async () => {
      throw new Error('offline');
    }, { ...fs, now: 2000, random: () => 0.5 }),
    /offline/,
  );
  assert.equal([...fs.directories.values()].some((row) => row.deleted), true);
});

test('a later upload sweeps abandoned staging directories older than 24 hours', () => {
  const fs = fakeFs();
  const stale = new fs.Directory(fs.cacheRoot, 'urtruck-upload-stale');
  stale.create();
  fs.directories.get(stale.uri).modified = 1;
  const fresh = new fs.Directory(fs.cacheRoot, 'urtruck-upload-fresh');
  fresh.create();
  fs.directories.get(fresh.uri).modified = 30 * 60 * 60 * 1000;
  sweepStaleNativeUploads({ Directory: fs.Directory, cacheRoot: fs.cacheRoot, now: 31 * 60 * 60 * 1000 });
  assert.equal(fs.directories.get(stale.uri).deleted, true);
  assert.equal(fs.directories.get(fresh.uri).deleted, false);
  assert.equal(safeNativeUploadName('  накладная-义乌.pdf  '), 'накладная-义乌.pdf');
});
