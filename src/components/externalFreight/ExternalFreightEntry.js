import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';
import { EXTERNAL_FREIGHT_ENABLED } from '../../utils/externalFreightFeed';

// Основная шапка не изменяется: у ленты только отдельная кнопка входа.
export default function ExternalFreightEntry(props) {
  const { navigation, role, ceramic, showBack, children } = props;
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const { lang } = useI18n();
  if (!EXTERNAL_FREIGHT_ENABLED || showBack || !['driver', 'client'].includes(role)) return children;
  const labels = {
    RU: role === 'driver' ? 'Лента грузов' : 'Лента машин',
    KK: role === 'driver' ? 'Жүк лентасы' : 'Көлік лентасы',
    ZH: role === 'driver' ? '货源信息' : '空车信息',
    EN: role === 'driver' ? 'Cargo feed' : 'Available trucks',
  };
  const palette = ceramic ? ceramicColors : colors;
  return <View>
    {children}
    <View style={styles.entrySlot} pointerEvents="box-none">
      <TouchableOpacity testID="external-freight-entry" accessibilityRole="button" accessibilityLabel={labels[lang] || labels.EN}
        onPress={() => navigation.navigate('ExternalFreightFeed')} style={styles.entry}>
        <Feather name="truck" size={14} color={palette.text} />
        <Text style={[styles.label, { color: palette.text }]}>{labels[lang] || labels.EN}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  entrySlot: { position: 'absolute', left: 16, right: 80, top: 0, bottom: 0, justifyContent: 'center' },
  entry: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10 },
  label: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
