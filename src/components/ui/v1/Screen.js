// Screen — root container for v1 onboarding screens.
// Pure-black background to match the macros; SafeAreaView for status bar.

import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useV1Colors, v1Spacing } from '../../../theme/designV1';
import KeyboardSafeLayout, { KeyboardSafeScrollView } from './KeyboardSafeLayout';

export default function Screen({ children, contentStyle, scroll = true, keyboardAvoiding = true }) {
  const colors = useV1Colors();
  const Body = scroll ? KeyboardSafeScrollView : React.Fragment;
  const bodyProps = scroll
    ? {
        contentContainerStyle: [s.scroll, contentStyle],
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled',
      }
    : {};
  const inner = <Body {...bodyProps}>{children}</Body>;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      {keyboardAvoiding ? <KeyboardSafeLayout>{inner}</KeyboardSafeLayout> : inner}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: v1Spacing.screenPad, paddingBottom: 40 },
});
