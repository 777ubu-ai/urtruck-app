import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';

// Быстрые фразы ПО РОЛИ (как в inDrive): водитель сообщает статус и
// уточняет груз/оплату; грузоотправитель спрашивает «где машина», просит
// документы. Иконка вкладки — тут, тексты — i18n-ключи (реактивны к языку).
const DRIVER_CATEGORIES = [
  { icon: '🚛', nameKey: 'qp_tab_status', keys: ['phrLoading', 'phrLoaded', 'phrDeparting', 'phrDelay'] },
  { icon: '📦', nameKey: 'qp_tab_cargo',  keys: ['phrSendAddr', 'phrPallets', 'phrWeight'] },
  { icon: '💰', nameKey: 'qp_tab_price',  keys: ['qphrase_price_1', 'qphrase_price_3', 'qphrase_price_4', 'qphrase_price_5', 'phrCustoms'] },
  { icon: '📄', nameKey: 'qp_tab_docs',   keys: ['qphrase_docs_3', 'qphrase_docs_2'] },
];
const CLIENT_CATEGORIES = [
  { icon: '📍', nameKey: 'qp_tab_route', keys: ['qphrase_route_1', 'qphrase_route_2', 'qphrase_route_3', 'qphrase_route_5'] },
  { icon: '📄', nameKey: 'qp_tab_docs',  keys: ['qphrase_docs_1', 'qphrase_docs_4', 'qphrase_docs_2'] },
  { icon: '💰', nameKey: 'qp_tab_price', keys: ['qphrase_price_1', 'qphrase_price_2', 'qphrase_price_5'] },
];

export default function QuickPhrases({ onSelect, role }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const CATEGORIES = role === 'driver' ? DRIVER_CATEGORIES : CLIENT_CATEGORIES;
  const [activeTab, setActiveTab] = useState(0);
  const cat = CATEGORIES[Math.min(activeTab, CATEGORIES.length - 1)];

  return (
    <View style={[s.container, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
        {CATEGORIES.map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[s.tab, { backgroundColor: i === activeTab ? '#1A5C3C' : theme.card, borderColor: theme.border }]}
            onPress={() => setActiveTab(i)}
          >
            <Text style={[s.tabText, { color: i === activeTab ? '#FFF' : theme.textMuted }]}>{`${c.icon} ${t(c.nameKey)}`}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Phrases */}
      <ScrollView horizontal={false} contentContainerStyle={s.wrap}>
        {(cat.keys || []).map((k) => (
          <TouchableOpacity key={k} style={[s.btn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onSelect(t(k))}>
            <Text style={[s.text, { color: theme.textSecondary }]}>{t(k)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingVertical: 8, borderTopWidth: 1, maxHeight: 180 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, marginBottom: 8 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  tabText: { fontSize: 11, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14 },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  text: { fontSize: 12 },
});
