import React from 'react';

export default function PdfPreviewContent({ url, title }) {
  return React.createElement('iframe', {
    title,
    src: url,
    style: { flex: 1, width: '100%', border: 0, backgroundColor: '#0F1512' },
    sandbox: 'allow-same-origin allow-scripts',
  });
}
