import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const viewer = fs.readFileSync('src/components/deal/PdfPreviewModal.js', 'utf8');
const nativeViewer = fs.readFileSync('src/components/deal/PdfPreviewContent.native.js', 'utf8');
const webViewer = fs.readFileSync('src/components/deal/PdfPreviewContent.web.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('PDF viewer stays inside UrTruck and receives the original signed URL', () => {
  assert.doesNotMatch(viewer, /react-native-pdf/);
  assert.match(nativeViewer, /import Pdf from 'react-native-pdf'/);
  assert.match(webViewer, /iframe/);
  assert.match(nativeViewer, /source=\{\{ uri: url \}\}/);
  assert.match(viewer, /testID="pdf-preview-modal"/);
  assert.match(viewer, /testID="pdf-preview-close"/);
});

test('native PDF preview only reports success after real page content is rendered', () => {
  assert.match(nativeViewer, /testID="pdf-preview-native"/);
  assert.match(nativeViewer, /createPdfPreviewCallbacks/);
  assert.match(viewer, /testID="pdf-preview-page-rendered"/);
  assert.match(viewer, /testID="pdf-preview-render-error"/);
  assert.match(nativeViewer, /trustAllCerts=\{false\}/);
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
  assert.equal(pkg.dependencies['react-native-pdf'], '7.0.5');
  assert.equal(pkg.dependencies['react-native-blob-util'], '0.25.1');
});
