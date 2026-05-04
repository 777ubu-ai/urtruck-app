// BottomSheet — generic v1 sheet for filter pickers, currency dropdowns,
// any contextual menu. Slide-up modal, drag-handle, transparent overlay,
// graphite surface with rounded top corners. Children render the body.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { v1Colors, v1Radius } from '../../../theme/designV1';

export default function BottomSheet({ visible, onClose, title, children, scroll = true }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={s.handle} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          {scroll
            ? <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
            : children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: v1Colors.bgDeep,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32,
    borderTopWidth: 1, borderColor: v1Colors.border,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: v1Colors.borderStrong,
    alignSelf: 'center', marginVertical: 10,
  },
  title: { color: v1Colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
});
