import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';
import HeaderMenuButton from './HeaderMenuButton';

/** Canonical root header: profile/menu only. Native push + tab badges remain active. */
export default function RootHeader({ navigation, role, testID = 'root-header', menuTestID, ceramic = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  return (
    <View style={[s.row, { backgroundColor: palette.bg }]} testID={testID}>
      <HeaderMenuButton navigation={navigation} role={role} color={palette.text} testID={menuTestID || `${testID}-menu`} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
});
