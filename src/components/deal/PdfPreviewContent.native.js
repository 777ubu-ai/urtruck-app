import React from 'react';
import Pdf from 'react-native-pdf';
import { File, Paths } from 'expo-file-system';
import { createPdfPreviewCallbacks } from './pdfPreviewCallbacks';
import { deletePrivatePdfCachePath } from './privatePdfCache';

export default function PdfPreviewContent({ url, style, onMetadata, onRendered, onError }) {
  const cachedPath = React.useRef('');
  const cleanup = React.useCallback((path = cachedPath.current) => {
    if (!path) return;
    deletePrivatePdfCachePath(path, {
      cacheUri: Paths.cache.uri,
      createFile: (uri) => new File(uri),
    });
    if (path === cachedPath.current) cachedPath.current = '';
  }, []);
  React.useEffect(() => () => cleanup(), [cleanup]);
  const callbacks = createPdfPreviewCallbacks({
    onMetadata,
    onRendered,
    onError,
    onCacheFile: (path) => {
      if (cachedPath.current && cachedPath.current !== path) cleanup(cachedPath.current);
      cachedPath.current = path;
    },
  });
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
