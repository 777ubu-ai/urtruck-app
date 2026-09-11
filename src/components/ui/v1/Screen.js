// Screen — root container for v1 onboarding screens.
// Pure-black background to match the macros; SafeAreaView for status bar.
//
// `footer` (Commit 2, Design v1): optional node rendered AFTER the scroll
// body, still inside KeyboardSafeLayout — the canonical sticky-CTA slot for
// long forms. On iOS the KAV `padding` behavior lifts the footer directly
// above the IME; on Android adjustResize does the same. The submit CTA then
// never lives inside the scroll content tree.

import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useV1Colors, v1Spacing } from '../../../theme/designV1';
import KeyboardSafeLayout, { KeyboardSafeScrollView } from './KeyboardSafeLayout';

export default function Screen({ children, contentStyle, scroll = true, keyboardAvoiding = true, footer }) {
  const colors = useV1Colors();
  const Body = scroll ? KeyboardSafeScrollView : React.Fragment;
  const bodyProps = scroll
    ? {
        style: footer ? s.flex : undefined,
        contentContainerStyle: [s.scroll, contentStyle],
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled',
      }
    : {};
  const inner = <Body {...bodyProps}>{children}</Body>;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {keyboardAvoiding ? (
        <KeyboardSafeLayout>
          {inner}
          {footer}
        </KeyboardSafeLayout>
      ) : (
        <React.Fragment>
          {inner}
          {footer}
        </React.Fragment>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: v1Spacing.screenPad, paddingBottom: 40 },
});
