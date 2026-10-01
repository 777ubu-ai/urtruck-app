import React from 'react';
import Pdf from 'react-native-pdf';
import { createPdfPreviewCallbacks } from './pdfPreviewCallbacks';

export default function PdfPreviewContent({ url, style, onMetadata, onRendered, onError }) {
  const callbacks = createPdfPreviewCallbacks({ onMetadata, onRendered, onError });
  return (
    <Pdf
      testID="pdf-preview-native"
      source={{ uri: url }}
      style={style}
      cache
      trustAllCerts={false}
      {...callbacks}
    />
  );
}
