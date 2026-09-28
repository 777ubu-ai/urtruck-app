import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';
import HeaderMenuButton from './HeaderMenuButton';

/** Canonical root header: profile/menu only. Native push + tab badges remain active. */
export default function RootHeader({ navigation, role, testID = 'root-header', menuTestID, ceramic = false, showBack = false, compact = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  return (
    <View style={[s.row, compact && s.compact, showBack && s.rowWithBack, { backgroundColor: palette.bg }]} testID={testID}>
      {showBack ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID={`${testID}-back`}
          onPress={() => navigation.goBack()}
          style={s.back}
        >
          <Feather name="chevron-left" size={30} color={palette.text} />
        </TouchableOpacity>
      ) : null}
      <HeaderMenuButton navigation={navigation} role={role} color={palette.text} testID={menuTestID || `${testID}-menu`} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  compact: { minHeight: 42, height: 42, paddingHorizontal: 12 },
  rowWithBack: { justifyContent: 'space-between' },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
