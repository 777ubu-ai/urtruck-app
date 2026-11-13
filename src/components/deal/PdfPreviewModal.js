import React from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import PdfPreviewContent from './PdfPreviewContent';
import { useAuth } from '../../utils/AuthContext';

/**
 * Renders a private, already-authorized PDF URL inside UrTruck.
 * The URL is never rebuilt or re-signed on the client: the API remains the
 * authority for participant access and signed-link expiry.
 */
export default function PdfPreviewModal({ visible, url, secureFile, title = 'PDF', onClose }) {
  const { session } = useAuth();
  const owner = session?.user?.id || null;
  const openedOwner = React.useRef(owner);
  if (!visible) openedOwner.current = owner;
  const changedOwner = visible && openedOwner.current !== owner;
  const [pageState, setPageState] = React.useState({ page: 0, pages: 0, rendered: false });
  const [renderError, setRenderError] = React.useState(false);

  React.useEffect(() => {
    setPageState({ page: 0, pages: 0, rendered: false });
    setRenderError(false);
  }, [url, visible]);

  React.useEffect(() => { if (changedOwner) onClose?.(); }, [changedOwner, onClose]);

  if (changedOwner || (!url && !secureFile?.fileId)) return null;
  const content = visible ? (
    <PdfPreviewContent
      url={url}
      secureFile={secureFile}
      title={title}
      style={s.pdf}
      onMetadata={({ pages }) => setPageState((state) => ({ ...state, pages }))}
      onRendered={({ page, pages }) => { setRenderError(false); setPageState({ page, pages, rendered: true }); }}
      onError={() => setRenderError(true)}
    />
  ) : null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="pdf-preview-modal"
    >
      <SafeAreaProvider>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.header}>
            <Text numberOfLines={1} style={s.title}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeButton}
              testID="pdf-preview-close"
              accessibilityRole="button"
              accessibilityLabel="Close PDF preview"
            >
              <Text style={s.close}>×</Text>
            </TouchableOpacity>
          </View>
          {content}
          {Platform.OS !== 'web' && pageState.rendered ? (
            <Text testID="pdf-preview-page-rendered" style={s.pageStatus}>
              {pageState.page}/{pageState.pages}
            </Text>
          ) : null}
          {Platform.OS !== 'web' && renderError ? (
            <Text testID="pdf-preview-render-error" style={s.error}>PDF preview unavailable</Text>
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F1512' },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151E19',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: '#F3F7F4', fontSize: 16, fontWeight: '700', marginRight: 12 },
  close: { color: '#F3F7F4', fontSize: 32, lineHeight: 34, fontWeight: '300' },
  pdf: { flex: 1, width: '100%', backgroundColor: '#0F1512' },
  pageStatus: { color: '#DDE7E1', textAlign: 'center', paddingVertical: 6, backgroundColor: '#151E19' },
  error: { color: '#F2A8A8', textAlign: 'center', padding: 16 },
});
