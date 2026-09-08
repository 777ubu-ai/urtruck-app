// Design System 2026 — BottomSheet (§45), Modal (§44), Toast (§43).
import React from 'react';
import { View, Modal as RNModal, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens, radius2026, space2026, metrics2026, motion2026 } from '../../../theme/tokens2026';
import Text2026 from './Text';

export function BottomSheet2026({ visible, onClose, title, children, dismissable = true }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const translateY = React.useRef(new Animated.Value(320)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(translateY, { toValue: 0, duration: motion2026.sheet, useNativeDriver: true }).start();
    }
  }, [visible, translateY]);

  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={dismissable ? onClose : undefined} accessibilityLabel="Close sheet">
        <View style={[s.overlay, { backgroundColor: t['surface.overlay'] }]} />
      </TouchableWithoutFeedback>
      <View style={s.sheetAnchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, {
          backgroundColor: t['surface.card'],
          borderTopLeftRadius: radius2026.sheet,
          borderTopRightRadius: radius2026.sheet,
          paddingBottom: insets.bottom + space2026[4],
          transform: [{ translateY }],
        }]}>
          <View style={[s.handle, { backgroundColor: t['border.strong'] }]} />
          {title ? (
            <Text2026 variant="h3" style={{ marginBottom: space2026[3] }}>{title}</Text2026>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </RNModal>
  );
}

export function Modal2026({ visible, onClose, title, body, actions = [], dismissable = false }) {
  const t = useTokens();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.modalOverlay, { backgroundColor: t['surface.overlay'] }]}>
        <TouchableWithoutFeedback onPress={dismissable ? onClose : undefined}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[s.modal, {
          backgroundColor: t['surface.card'],
          borderRadius: metrics2026.modalRadius,
        }]}>
          {title ? <Text2026 variant="h3" style={{ marginBottom: space2026[2] }}>{title}</Text2026> : null}
          {body ? <Text2026 variant="body" color="text.secondary" style={{ marginBottom: space2026[5] }}>{body}</Text2026> : null}
          <View style={s.modalActions}>
            {actions.map((a) => (
              <TouchableOpacity
                key={a.label}
                accessibilityRole="button"
                accessibilityLabel={a.accessibilityLabel || a.label}
                onPress={a.onPress}
                activeOpacity={0.75}
                style={[s.modalAction, {
                  minHeight: 46,
                  backgroundColor: a.destructive ? t['status.danger.main']
                    : a.primary ? t['brand.primary'] : 'transparent',
                  borderRadius: radius2026.lg,
                }]}
              >
                <Text2026 variant="buttonCompact" style={{
                  color: a.destructive || a.primary ? t['text.onAccent'] : t['text.secondary'],
                }}>
                  {a.label}
                </Text2026>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

/** Toast (§43): single component, 4 tones, never overlaps composer/bottom nav/
 *  primary CTA — render above shell zones with bottom offset. */
export function Toast2026({ visible, message, tone = 'info', bottomOffset = 96, onHide, duration = 2600 }) {
  const t = useTokens();
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) return undefined;
    Animated.timing(opacity, { toValue: 1, duration: motion2026.normal, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: motion2026.normal, useNativeDriver: true })
        .start(() => onHide?.());
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onHide, opacity]);

  if (!visible) return null;
  const toneMain = t[`status.${tone}.main`] || t['status.info.main'];
  const toneSoft = t[`status.${tone}.soft`] || t['status.info.soft'];

  return (
    <Animated.View pointerEvents="none"
      style={[s.toast, {
        bottom: bottomOffset, opacity,
        backgroundColor: toneSoft, borderColor: toneMain,
        minHeight: metrics2026.toastHeight,
        borderRadius: radius2026.lg,
      }]}>
      <View style={[s.toastBar, { backgroundColor: toneMain }]} />
      <Text2026 variant="bodySmall" style={{ flexShrink: 1 }}>{message}</Text2026>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: space2026[4], maxHeight: '90%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: space2026[3] },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  modal: { alignSelf: 'stretch', maxWidth: 400, padding: space2026[5] },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space2026[2], flexWrap: 'wrap' },
  modalAction: { paddingHorizontal: space2026[4], alignItems: 'center', justifyContent: 'center' },
  toast: {
    position: 'absolute', left: space2026[4], right: space2026[4],
    flexDirection: 'row', alignItems: 'center', gap: space2026[3],
    paddingHorizontal: space2026[4], paddingVertical: 10,
    borderWidth: 1, zIndex: 1000,
  },
  toastBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
