import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/components/deal/PdfPreviewContent.web.js','utf8');
const viewer = readFileSync('web/pdf-viewer/viewer.js','utf8');
test('web-просмотр сообщает о реальном рендере и не передаёт URL сторонним сервисам', () => {
  assert.match(source, /\/pdf-viewer\/index\.html/);
  assert.match(source, /onRendered/);
  assert.match(source, /onError/);
  assert.match(viewer, /isEvalSupported:\s*false/);
  assert.match(viewer, /referrerPolicy:\s*['"]no-referrer/);
  assert.match(viewer, /render\(/);
});
