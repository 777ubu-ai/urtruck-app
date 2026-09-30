import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const viewer = fs.readFileSync('src/components/deal/PdfPreviewModal.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('PDF viewer stays inside UrTruck and receives the original signed URL', () => {
  assert.match(viewer, /WebView/);
  assert.match(viewer, /iframe/);
  assert.match(viewer, /source=\{\{ uri: url \}\}/);
  assert.match(viewer, /testID="pdf-preview-modal"/);
  assert.match(viewer, /testID="pdf-preview-close"/);
});

test('attachment list routes PDF to the in-app viewer but keeps non-PDF fallback unchanged', () => {
  assert.match(attachments, /isPdfAttachment/);
  assert.match(attachments, /setPdfPreview\(\{ url, title:/);
  assert.match(attachments, /<PdfPreviewModal/);
  assert.match(attachments, /Linking\.openURL\(url\)/);
});

test('deal document bubbles route PDF to the same viewer', () => {
  assert.match(workspace, /meta\.ext === 'pdf'/);
  assert.match(workspace, /setPdfPreview\(\{ url: item\.docUrl, title: item\.docName \}\)/);
  assert.match(workspace, /<PdfPreviewModal/);
  assert.match(workspace, /Linking\.openURL\(item\.docDownloadUrl \|\| item\.docUrl\)/);
});

test('native viewer dependency is explicit and locked', () => {
  assert.equal(pkg.dependencies['react-native-webview'], '13.16.0');
});
