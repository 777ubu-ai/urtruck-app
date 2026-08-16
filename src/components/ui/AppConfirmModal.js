import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useV1Colors } from '../../theme/designV1';

/**
 * Product-controlled confirmation dialog.
 * Unlike window.confirm / native browser dialogs, every visible button label
 * is supplied by UrTruck i18n, so app locale wins over device/browser locale.
 */
export default function AppConfirmModal({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
  testID = 'app-confirm-modal',
}) {
  const v1 = useV1Colors();
  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel} testID={`${testID}-backdrop`}>
        <Pressable
          style={[styles.card, { backgroundColor: v1.surface, borderColor: v1.border }]}
          onPress={(event) => event?.stopPropagation?.()}
          testID={testID}
        >
          <Text style={[styles.title, { color: v1.text }]}>{title || ''}</Text>
          {!!message && <Text style={[styles.message, { color: v1.textMuted }]}>{message}</Text>}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.cancel, { borderColor: v1.border }]}
              onPress={onCancel}
              testID={`${testID}-cancel`}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: v1.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                styles.confirm,
                { backgroundColor: destructive ? '#EF4444' : '#168759' },
              ]}
              onPress={onConfirm}
              testID={`${testID}-confirm`}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  title: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancel: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  confirm: {},
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
