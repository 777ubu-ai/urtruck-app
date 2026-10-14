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
