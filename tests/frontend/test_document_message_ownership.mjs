import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOwnDocument, reconcileChatMessages } from '../../src/utils/chatMessageListState.js';

test('серверное авторство документа важнее несовпадающего локального ID', () => {
  assert.equal(isOwnDocument({ mine: true, uploader_id: 'canonical' }, 'local'), true);
  assert.equal(isOwnDocument({ mine: false, uploader_id: 'local' }, 'local'), false);
});

test('старый API использует ID, но отсутствующие ID не считаются своими', () => {
  assert.equal(isOwnDocument({ uploader_id: 'owner' }, 'owner'), true);
  assert.equal(isOwnDocument({ uploader_id: 'other' }, 'owner'), false);
  assert.equal(isOwnDocument({}, undefined), false);
  assert.equal(isOwnDocument({ uploader_id: '' }, ''), false);
});

test('загрузка с сервера сохраняет сторону документа после отправки и повторного polling', () => {
  const optimistic = { id: 'upload-1', kind: 'document', mine: true, optimistic: true };
  const remote = { id: 'doc_1', clientUploadId: 'upload-1', kind: 'document',
    mine: isOwnDocument({ mine: true, uploader_id: 'canonical' }, 'local'), createdAt: '2026-10-10T07:24:54Z' };
  const first = reconcileChatMessages([optimistic], [], [remote]);
  assert.equal(first.length, 1);
  assert.equal(first[0].mine, true);
  assert.equal(reconcileChatMessages(first, [], [{ ...remote }]), first);
  assert.equal(reconcileChatMessages([], [], [remote])[0].mine, true);
  assert.equal(isOwnDocument({ mine: false, uploader_id: 'canonical' }, 'other'), false);
});

test('чат применяет серверное авторство при загрузке документов', () => {
  const screen = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  const documents = screen.slice(screen.indexOf('const serverDocs ='), screen.indexOf('setMessages((previous) =>'));
  assert.match(documents, /mine: isOwnDocument\(a, session\?\.user\?\.id\)/);
});
