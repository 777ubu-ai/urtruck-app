import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useV1Colors } from '../../../theme/designV1';
import BellBadge from './BellBadge';
import HeaderMenuButton from './HeaderMenuButton';

/** Canonical root header: notifications left, profile/menu right. */
export default function RootHeader({ navigation, role, onBellPress, bellCount = 0, testID = 'root-header', bellTestID, menuTestID }) {
  const colors = useV1Colors();
  return (
    <View style={[s.row, { backgroundColor: colors.bg }]} testID={testID}>
      <BellBadge onPress={onBellPress} count={bellCount} testID={bellTestID || `${testID}-bell`} />
      <HeaderMenuButton navigation={navigation} role={role} color={colors.text} testID={menuTestID || `${testID}-menu`} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
