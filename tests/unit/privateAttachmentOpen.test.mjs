import test from 'node:test';
import assert from 'node:assert/strict';
import { openPrivateAttachment } from '../../src/utils/privateAttachmentOpen.js';

test('native document open fetches the server-authorized attachment ID and opens verified bytes', async () => {
  const events = [];
  const payload = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const result = await openPrivateAttachment({
    roomId: 'room-7',
    fileId: 'attachment-19',
    name: 'Накладная №19.pdf',
    platform: 'ios',
    getPrivateFile: async (room, file) => {
      events.push(['fetch', room, file]);
      return { bytes: payload.buffer, mime: 'application/pdf' };
    },
    createTempFile: async (name, bytes) => {
      events.push(['stage', name, [...bytes]]);
      return { path: '/private/cache/urtruck-document.pdf' };
    },
    openWithViewer: async (platform, path, mime) => events.push(['open', platform, path, mime]),
  });

  assert.deepEqual(events, [
    ['fetch', 'room-7', 'attachment-19'],
    ['stage', 'Накладная №19.pdf', [0x25, 0x50, 0x44, 0x46]],
    ['open', 'ios', '/private/cache/urtruck-document.pdf', 'application/pdf'],
  ]);
  assert.equal(result.filename, 'Накладная №19.pdf');
});

test('authorization, MIME, and size failures never open or stage a file', async () => {
  let staged = false;
  let opened = false;
  const common = {
    roomId: 'room-7', fileId: 'attachment-19', name: 'invoice.xlsx', platform: 'android',
    createTempFile: async () => { staged = true; return { path: '/cache/file.xlsx' }; },
    openWithViewer: async () => { opened = true; },
  };

  await assert.rejects(openPrivateAttachment({ ...common, getPrivateFile: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }); } }), /forbidden/);
  await assert.rejects(openPrivateAttachment({ ...common, getPrivateFile: async () => ({ bytes: new Uint8Array([1]).buffer, mime: 'application/pdf' }) }), /type_mismatch/);
  await assert.rejects(openPrivateAttachment({ ...common, getPrivateFile: async () => ({ bytes: new Uint8Array(12 * 1024 * 1024 + 1).buffer, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) }), /too_large/);
  assert.equal(staged, false);
  assert.equal(opened, false);
});

test('zero-length private document is rejected before staging or opening', async () => {
  let staged = false;
  let opened = false;
  await assert.rejects(openPrivateAttachment({
    roomId: 'room-7', fileId: 'attachment-empty', name: 'empty.pdf', platform: 'ios',
    getPrivateFile: async () => ({ bytes: new ArrayBuffer(0), mime: 'application/pdf' }),
    createTempFile: async () => { staged = true; return { path: '/cache/empty.pdf' }; },
    openWithViewer: async () => { opened = true; },
  }), /private_file_empty/);
  assert.equal(staged, false);
  assert.equal(opened, false);
});
