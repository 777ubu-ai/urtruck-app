import React from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PdfPreviewContent from './PdfPreviewContent';

/**
 * Renders a private, already-authorized PDF URL inside UrTruck.
 * The URL is never rebuilt or re-signed on the client: the API remains the
 * authority for participant access and signed-link expiry.
 */
export default function PdfPreviewModal({ visible, url, title = 'PDF', onClose }) {
  const [pageState, setPageState] = React.useState({ page: 0, pages: 0, rendered: false });
  const [renderError, setRenderError] = React.useState(false);

  React.useEffect(() => {
    setPageState({ page: 0, pages: 0, rendered: false });
    setRenderError(false);
  }, [url, visible]);

  if (!url) return null;
  const content = (
    <PdfPreviewContent
      url={url}
      title={title}
      style={s.pdf}
      onMetadata={({ pages }) => setPageState((state) => ({ ...state, pages }))}
      onRendered={({ page, pages }) => setPageState({ page, pages, rendered: true })}
      onError={() => setRenderError(true)}
    />
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="pdf-preview-modal"
    >
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text numberOfLines={1} style={s.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} testID="pdf-preview-close" accessibilityLabel="Close PDF preview">
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
  title: { flex: 1, color: '#F3F7F4', fontSize: 16, fontWeight: '700', marginRight: 12 },
  close: { color: '#F3F7F4', fontSize: 32, lineHeight: 34, fontWeight: '300' },
  pdf: { flex: 1, width: '100%', backgroundColor: '#0F1512' },
  pageStatus: { color: '#DDE7E1', textAlign: 'center', paddingVertical: 6, backgroundColor: '#151E19' },
  error: { color: '#F2A8A8', textAlign: 'center', padding: 16 },
});
