import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';
import BellBadge from './BellBadge';
import HeaderMenuButton from './HeaderMenuButton';
import { useAuth } from '../../../utils/AuthContext';
import { useUnreadNotifications } from '../../../utils/useUnreadNotifications';

/** Canonical root header: notifications left, profile/menu right. */
export default function RootHeader({ navigation, role, onBellPress, bellCount, title, testID = 'root-header', bellTestID, menuTestID, ceramic = false, hideBell = false }) {
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
      <View style={s.left}>
        {title ? <Text style={[s.title, { color: palette.text }]} numberOfLines={1}>{title}</Text> : null}
        {hideBell ? null : <BellBadge onPress={onBellPress} count={visibleBellCount} ceramic={ceramic} testID={bellTestID || `${testID}-bell`} />}
      </View>
      <HeaderMenuButton navigation={navigation} role={role} color={palette.text} testID={menuTestID || `${testID}-menu`} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.2 },
});
