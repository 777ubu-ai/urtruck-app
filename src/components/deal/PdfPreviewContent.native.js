import React from 'react';
import Pdf from 'react-native-pdf';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { chatAPI } from '../../utils/chatAPI';
import { getLanguage } from '../../utils/i18n';
import { createPdfPreviewCallbacks } from './pdfPreviewCallbacks';
import { deletePrivatePdfCachePath, PRIVATE_PDF_CACHE_PREFIX } from './privatePdfCache';
import { sweepPrivatePdfCache } from './privatePdfCacheStartup';

export default function PdfPreviewContent({ url, secureFile, style, onMetadata, onRendered, onError }) {
  const [loaded, setLoaded] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const secureKey = secureFile ? JSON.stringify([secureFile.roomId, secureFile.fileId]) : '';
  const errorCallback = React.useRef(onError);
  errorCallback.current = onError;
  const cacheFileName = React.useMemo(
    () => `${PRIVATE_PDF_CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
    [url, secureFile?.roomId, secureFile?.fileId],
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
  React.useEffect(() => {
    setLoaded(null);
    setFailed(false);
    if (!secureFile?.roomId || !secureFile?.fileId) return undefined;
    const controller = new AbortController();
    const file = new File(expectedCachePath);
    chatAPI.getPrivateFile('attachment', secureFile.roomId, secureFile.fileId, { signal: controller.signal })
      .then(({ bytes }) => {
        if (controller.signal.aborted) return;
        file.create({ overwrite: true, intermediates: true });
        file.write(new Uint8Array(bytes));
        if (controller.signal.aborted) cleanup(expectedCachePath);
        else setLoaded({ key: secureKey, uri: file.uri });
      })
      .catch(() => { if (!controller.signal.aborted) { cleanup(expectedCachePath); setFailed(true); errorCallback.current?.(); } });
    return () => { controller.abort(); cleanup(expectedCachePath); };
  }, [secureFile?.roomId, secureFile?.fileId, secureKey, expectedCachePath, cleanup, attempt]);
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
  if (secureFile && loaded?.key !== secureKey) {
    const retry = { RU: 'Повторить', KK: 'Қайталау', EN: 'Retry', ZH: '重试', TR: 'Tekrar dene', UZ: 'Qayta urinish', KY: 'Кайталоо', TG: 'Дубора', BE: 'Паўтарыць' };
    return <View style={style}>{failed ? <TouchableOpacity onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={{ color: '#fff' }}>{retry[getLanguage()] || retry.EN}</Text></TouchableOpacity> : <ActivityIndicator />}</View>;
  }
  return (
    <Pdf
      testID="pdf-preview-native"
      source={secureFile ? { uri: loaded.uri, cache: false } : { uri: url, cacheFileName }}
      style={style}
      cache={!secureFile}
      trustAllCerts={false}
      {...callbacks}
    />
  );
}
