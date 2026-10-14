import test from 'node:test';
import assert from 'node:assert/strict';
import { displayAttachmentFilename } from '../../src/utils/attachmentFilename.js';

test('decodes UTF-8 encoded attachment names for display only', () => {
  assert.equal(displayAttachmentFilename('%D0%97%D0%B0%D0%BA%D0%B0%D0%B7.pdf'), 'Заказ.pdf');
});

test('malformed, empty, and control-containing encoded names fall back safely', () => {
  assert.equal(displayAttachmentFilename('%D0%A'), '%D0%A');
  assert.equal(displayAttachmentFilename(''), '');
  assert.equal(displayAttachmentFilename('%00secret.pdf'), '%00secret.pdf');
});

test('decoding is presentation-only and PDF classification uses the readable suffix', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('src/components/deal/DealAttachments.js', 'utf8');
  assert.match(source, /import \{ displayAttachmentFilename \} from '..\/..\/utils\/attachmentFilename'/);
  assert.match(source, /displayAttachmentFilename\(item\?\.original_name/);
  assert.match(source, /const url = item\?\.url \|\| item\?\.signed_url \|\| item\?\.download_url/);
});


test('chat hydration decodes the document label while preserving its URL and owner', async () => {
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('@babel/parser');
  const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let callback;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'serverDocs') {
      callback = node.init?.arguments?.[0];
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  assert.equal(callback?.type, 'ArrowFunctionExpression');
  const makeHydrator = new Function(
    'resolveAttachment', 'attachmentUrlCache', 'cacheIssuedAttachmentUrl',
    'isOwnDocument', 'session', 'documentKindFromFile', 'fmtMessageTime',
    'displayAttachmentFilename',
    `return (${source.slice(callback.start, callback.end)})`,
  );
  const hydrate = makeHydrator(
    (url) => url, { current: new Map() }, (_cache, _key, url) => url,
    (attachment, owner) => attachment.owner_id === owner,
    { user: { id: 'owner-a' } }, (mime, name) => ({ mime, name }),
    (time) => time, displayAttachmentFilename,
  );
  const signedUrl = 'https://example.invalid/private.pdf?signature=fixture';
  const doc = hydrate({
    id: 'attachment-a', original_name: '%D0%97%D0%B0%D0%BA%D0%B0%D0%B7.pdf',
    mime_type: 'application/pdf', owner_id: 'owner-a', url: signedUrl,
  });
  assert.equal(doc.docName, 'Заказ.pdf');
  assert.equal(doc.docKind.name, 'Заказ.pdf');
  assert.equal(doc.docUrl, signedUrl);
  assert.equal(doc.docDownloadUrl, signedUrl);
  assert.equal(doc.id, 'doc_attachment-a');
  assert.equal(doc.mine, true);
  assert.equal(hydrate({ id: 'attachment-b', owner_id: 'owner-b', url: signedUrl }).mine, false);
});
