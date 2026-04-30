import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/theme';

export default function AppShell({ children, style }) {
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={[s.native, style]} edges={['top']}>
        {children}
      </SafeAreaView>
    );
  }

  return (
    <View style={s.webOuter}>
      <View style={[s.webInner, style]}>
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  native: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webOuter: {
    flex: 1,
    backgroundColor: '#040608',
    alignItems: 'center',
    minHeight: '100vh',
  },
  webInner: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    minHeight: '100vh',
  },
});
