import React from 'react';
import Pdf from 'react-native-pdf';
import { File, Paths } from 'expo-file-system';
import { createPdfPreviewCallbacks } from './pdfPreviewCallbacks';
import { deletePrivatePdfCachePath, PRIVATE_PDF_CACHE_PREFIX } from './privatePdfCache';
import { sweepPrivatePdfCache } from './privatePdfCacheStartup';

export default function PdfPreviewContent({ url, style, onMetadata, onRendered, onError }) {
  const cacheFileName = React.useMemo(
    () => `${PRIVATE_PDF_CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
    [url],
  );
  const expectedCachePath = React.useMemo(
    () => new File(Paths.cache, cacheFileName).uri,
    [cacheFileName],
  );
  const cachedPath = React.useRef(expectedCachePath);
  const cleanup = React.useCallback((path = cachedPath.current) => {
    if (!path) return;
    deletePrivatePdfCachePath(path, {
      cacheUri: Paths.cache.uri,
      createFile: (uri) => new File(uri),
    });
    if (path === cachedPath.current) cachedPath.current = '';
  }, []);
  React.useEffect(() => {
    cachedPath.current = expectedCachePath;
    sweepPrivatePdfCache(expectedCachePath);
    return () => cleanup(expectedCachePath);
  }, [cleanup, expectedCachePath]);
  const callbacks = createPdfPreviewCallbacks({
    onMetadata,
    onRendered,
    onError: (reason) => {
      cleanup(expectedCachePath);
      onError?.(reason);
    },
    onCacheFile: (path) => {
      if (cachedPath.current && cachedPath.current !== path) cleanup(cachedPath.current);
      cachedPath.current = path;
    },
  });
  return (
    <Pdf
      testID="pdf-preview-native"
      source={{ uri: url, cacheFileName }}
      style={style}
      cache
      trustAllCerts={false}
      {...callbacks}
    />
  );
}
