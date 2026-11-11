import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePrivateAudio, sweepPrivateAudioEntries, PRIVATE_AUDIO_PREFIX } from '../../src/utils/privateAudioCache.js';

test('аудио записывается в собственный cache и удаляется только один раз', () => {
  let deleted = 0, saved;
  class FakeFile {
    constructor(root, name) { assert.equal(root, 'cache'); this.uri = `file:///cache/${name}`; this.exists = false; }
    create(options) { assert.equal(options.overwrite, false); this.exists = true; }
    write(data) { saved = Array.from(data); }
    delete() { deleted++; this.exists = false; }
  }
  const file = stagePrivateAudio({ FileClass: FakeFile, cacheRoot: 'cache', bytes: new Uint8Array([1, 2]).buffer, mime: 'audio/mp4', nonce: '1' });
  assert.ok(file.uri.includes(`${PRIVATE_AUDIO_PREFIX}1.m4a`));
  assert.deepEqual(saved, [1, 2]);
  file.dispose(); file.dispose();
  assert.equal(deleted, 1);
});

test('неизвестный тип и существующий файл не удаляют чужие данные', () => {
  let deleted = 0;
  class ExistingFile { constructor() { this.exists = true; } create() { throw new Error('exists'); } delete() { deleted++; } }
  assert.throws(() => stagePrivateAudio({ FileClass: ExistingFile, cacheRoot: 'cache', bytes: new ArrayBuffer(1), mime: 'text/html', nonce: '1' }), /invalid_audio_type/);
  assert.throws(() => stagePrivateAudio({ FileClass: ExistingFile, cacheRoot: 'cache', bytes: new ArrayBuffer(1), mime: 'audio/wav', nonce: '1' }), /exists/);
  assert.equal(deleted, 0);
});

test('очистка не затрагивает пользовательские и чужие файлы', () => {
  const removed = [];
  const entries = [{ name: `${PRIVATE_AUDIO_PREFIX}1.wav`, uri: 'file:///cache/1.wav' }, { name: 'voice.wav', uri: 'file:///cache/voice.wav' }];
  assert.equal(sweepPrivateAudioEntries(entries, value => { removed.push(value); return true; }), 1);
  assert.deepEqual(removed, ['file:///cache/1.wav']);
});

test('неполный cache-файл удаляется при ошибке записи', () => {
  let deleted = 0;
  class FailedFile {
    constructor() { this.exists = false; }
    create() { this.exists = true; }
    write() { throw new Error('disk_error'); }
    delete() { deleted++; this.exists = false; }
  }
  assert.throws(() => stagePrivateAudio({ FileClass: FailedFile, cacheRoot: 'cache', bytes: new ArrayBuffer(1), mime: 'audio/wav', nonce: '1' }), /disk_error/);
  assert.equal(deleted, 1);
});
