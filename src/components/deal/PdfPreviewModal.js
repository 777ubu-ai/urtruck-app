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
import { WebView } from 'react-native-webview';

/**
 * Renders a private, already-authorized PDF URL inside UrTruck.
 * The URL is never rebuilt or re-signed on the client: the API remains the
 * authority for participant access and signed-link expiry.
 */
export default function PdfPreviewModal({ visible, url, title = 'PDF', onClose }) {
  if (!url) return null;
  const content = Platform.OS === 'web'
    ? React.createElement('iframe', {
      title,
      src: url,
      style: { flex: 1, width: '100%', border: 0, backgroundColor: '#0F1512' },
      sandbox: 'allow-same-origin allow-scripts',
    })
    : (
      <WebView
        testID="pdf-preview-webview"
        source={{ uri: url }}
        originWhitelist={['*']}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
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
});
