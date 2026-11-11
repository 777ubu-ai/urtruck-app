import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const viewer = fs.readFileSync('src/components/deal/PdfPreviewModal.js', 'utf8');
const nativeViewer = fs.readFileSync('src/components/deal/PdfPreviewContent.native.js', 'utf8');
const webViewer = fs.readFileSync('src/components/deal/PdfPreviewContent.web.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('PDF viewer stays inside UrTruck and supports protected content', () => {
  assert.doesNotMatch(viewer, /react-native-pdf/);
  assert.match(nativeViewer, /import Pdf from 'react-native-pdf'/);
  assert.match(webViewer, /iframe/);
  assert.match(nativeViewer, /chatAPI\.getPrivateFile/);
  assert.match(nativeViewer, /uri: loaded\.uri/);
  assert.match(webViewer, /chatAPI\.getPrivateFile/);
  assert.match(viewer, /testID="pdf-preview-modal"/);
  assert.match(viewer, /testID="pdf-preview-close"/);
  assert.match(viewer, /import \{ SafeAreaProvider, SafeAreaView \} from 'react-native-safe-area-context'/);
  assert.match(viewer, /<SafeAreaProvider>[\s\S]*<SafeAreaView style=\{s\.safe\} edges=\{\['top', 'bottom'\]\}>/);
  assert.match(viewer, /style=\{s\.closeButton\}/);
  assert.match(viewer, /closeButton:\s*\{[\s\S]*?minWidth:\s*44,[\s\S]*?minHeight:\s*44/);
});

test('native PDF preview only reports success after real page content is rendered', () => {
  assert.match(nativeViewer, /testID="pdf-preview-native"/);
  assert.match(nativeViewer, /createPdfPreviewCallbacks/);
  assert.match(viewer, /testID="pdf-preview-page-rendered"/);
  assert.match(viewer, /testID="pdf-preview-render-error"/);
  assert.match(nativeViewer, /trustAllCerts=\{false\}/);
});

test('attachment list routes PDF and other native documents through protected IDs', () => {
  assert.match(attachments, /isPdfAttachment/);
  assert.match(attachments, /setPdfPreview\(\{ url: '', title:/);
  assert.match(attachments, /fileId: item\.id/);
  assert.match(attachments, /openPrivateChatAttachment\(conversationId, item\.id/);
  assert.doesNotMatch(attachments, /Linking\.openURL\(/);
  assert.match(attachments, /<PdfPreviewModal/);
});

test('deal document bubbles route PDF to the same viewer', () => {
  assert.match(workspace, /meta\.ext === 'pdf'/);
  assert.match(workspace, /setPdfPreview\(\{ url: '', title: item\.docName, secureFile:/);
  assert.match(workspace, /<PdfPreviewModal/);
  assert.match(workspace, /openPrivateChatAttachment\(roomId, item\.attachmentId, item\.docName\)/);
  assert.doesNotMatch(workspace, /Linking\.openURL\(item\.docDownloadUrl \|\| item\.docUrl\)/);
});

test('native viewer dependency is explicit and locked', () => {
  assert.equal(pkg.dependencies['react-native-pdf'], '7.0.5');
  assert.equal(pkg.dependencies['react-native-blob-util'], '0.25.1');
});
