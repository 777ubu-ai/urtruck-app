import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';
import HeaderMenuButton from './HeaderMenuButton';
import { EXTERNAL_FREIGHT_ENABLED } from '../../../utils/externalFreightFeed';
import { useI18n } from '../../../utils/useI18n';

/** Canonical root header: profile/menu only. Native push + tab badges remain active. */
export default function RootHeader({ navigation, role, testID = 'root-header', menuTestID, ceramic = false, showBack = false, compact = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const { lang } = useI18n();
  const palette = ceramic ? ceramicColors : colors;
  const labels = { RU: role === 'driver' ? 'Лента грузов' : 'Лента машин', KK: role === 'driver' ? 'Жүк лентасы' : 'Көлік лентасы', ZH: role === 'driver' ? '货源信息' : '空车信息', EN: role === 'driver' ? 'Cargo feed' : 'Available trucks' };
  const showFeed = EXTERNAL_FREIGHT_ENABLED && (role === 'driver' || role === 'client');
  return (
    <View style={[s.row, compact && (showFeed ? s.compactWithFeed : s.compact), (showBack || showFeed) && s.rowWithBack, { backgroundColor: palette.bg }]} testID={testID}>
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
      {!showBack && showFeed ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={labels[lang] || labels.EN}
          testID="external-freight-entry"
          onPress={() => navigation.navigate('ExternalFreightFeed')}
          style={s.feedButton}
          activeOpacity={0.75}
        >
          <Feather name="truck" size={14} color={palette.text} />
          <Text style={[s.feedLabel, { color: palette.text }]}>{labels[lang] || labels.EN}</Text>
        </TouchableOpacity>
      ) : null}
      <HeaderMenuButton navigation={navigation} role={role} color={palette.text} testID={menuTestID || `${testID}-menu`} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  compact: { minHeight: 42, height: 42, paddingHorizontal: 12 },
  compactWithFeed: { minHeight: 42, paddingHorizontal: 12 },
  rowWithBack: { justifyContent: 'space-between' },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  feedButton: { maxWidth: '72%', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingRight: 10 },
  feedLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
