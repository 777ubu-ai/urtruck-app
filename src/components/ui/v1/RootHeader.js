import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';
import BellBadge from './BellBadge';
import HeaderMenuButton from './HeaderMenuButton';
import { useAuth } from '../../../utils/AuthContext';
import { useUnreadNotifications } from '../../../utils/useUnreadNotifications';

/** Canonical root header: notifications left, profile/menu right. */
export default function RootHeader({ navigation, role, onBellPress, bellCount, testID = 'root-header', bellTestID, menuTestID, ceramic = false, hideBell = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  const { hasToken } = useAuth();
  // Bell is the cross-product inbox: its count includes durable business
  // notifications and unread chat rows exactly once.
  const unread = useUnreadNotifications(hasToken, { includeChat: true });
  const visibleBellCount = Number.isFinite(Number(bellCount)) ? Number(bellCount) : unread;
  return (
    <View style={[s.row, { backgroundColor: palette.bg }]} testID={testID}>
      {hideBell ? null : <BellBadge onPress={onBellPress} count={visibleBellCount} ceramic={ceramic} testID={bellTestID || `${testID}-bell`} />}
      <HeaderMenuButton navigation={navigation} role={role} color={palette.text} testID={menuTestID || `${testID}-menu`} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
