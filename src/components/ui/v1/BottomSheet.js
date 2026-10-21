// BottomSheet — generic v1 sheet for filter pickers, currency dropdowns,
// any contextual menu. Slide-up modal, drag-handle, transparent overlay,
// graphite/white surface with rounded top corners. Children render the body.
//
// Stage 6 polish: colours pulled from useV1Colors() so the sheet tracks
// the active theme. Overlay scrim is a single 50/65 % black for both
// modes — tints below the sheet read fine on white and on near-black.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import KeyboardSafeLayout, { KeyboardSafeScrollView } from './KeyboardSafeLayout';
import { useV1Colors } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';

export default function BottomSheet({ visible, onClose, title, children, scroll = true, footer = null, testID }) {
  const colors = useV1Colors();
  const { isDark } = useTheme();
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(15,23,42,0.45)';
  // Общий контракт учитывает и Android edge-to-edge, где одного
  // adjustResize недостаточно. Footer остаётся вне прокручиваемого тела.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeLayout>
        <TouchableOpacity style={[s.overlay, { backgroundColor: overlayBg }]} activeOpacity={1} onPress={onClose} testID={testID ? `${testID}-overlay` : undefined}>
          <TouchableOpacity
            style={[
              s.sheet,
              { backgroundColor: colors.bgDeep, borderTopColor: colors.border },
            ]}
            activeOpacity={1}
            onPress={() => {}}
            testID={testID}
          >
            <View style={[s.handle, { backgroundColor: colors.borderStrong }]} />
            {title ? <Text style={[s.title, { color: colors.text }]}>{title}</Text> : null}
            {scroll
              ? <KeyboardSafeScrollView style={s.body} showsVerticalScrollIndicator={false}>{children}</KeyboardSafeScrollView>
              : children}
            {/* Закреплённый футер — кнопки действий всегда видны, не уезжают
                в прокрутку (баг «внизу кнопки не видать» в длинном фильтре). */}
            {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardSafeLayout>
    </Modal>
  );
}

const s = StyleSheet.create({
  body: { maxHeight: 480, flexShrink: 1 },
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
