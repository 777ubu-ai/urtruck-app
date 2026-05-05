// BottomSheet — generic v1 sheet for filter pickers, currency dropdowns,
// any contextual menu. Slide-up modal, drag-handle, transparent overlay,
// graphite/white surface with rounded top corners. Children render the body.
//
// Stage 6 polish: colours pulled from useV1Colors() so the sheet tracks
// the active theme. Overlay scrim is a single 50/65 % black for both
// modes — tints below the sheet read fine on white and on near-black.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useV1Colors } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';

export default function BottomSheet({ visible, onClose, title, children, scroll = true }) {
  const colors = useV1Colors();
  const { isDark } = useTheme();
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(15,23,42,0.45)';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={[s.overlay, { backgroundColor: overlayBg }]} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={[
            s.sheet,
            { backgroundColor: colors.bgDeep, borderTopColor: colors.border },
          ]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={[s.handle, { backgroundColor: colors.borderStrong }]} />
          {title ? <Text style={[s.title, { color: colors.text }]}>{title}</Text> : null}
          {scroll
            ? <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
            : children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginVertical: 10,
  },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
});
