import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';

const CATEGORIES = [
  {
    name: '🚛 Рейс',
    phrases: ['phrLoading', 'phrDelay', 'phrDeparting', 'phrLoaded', 'phrCustoms'],
  },
  {
    name: '📦 Груз',
    phrases: ['phrSendAddr', 'phrPallets', 'phrWeight'],
  },
  {
    name: '💰 Цена',
    raw: [
      'Какая финальная цена?',
      'Цена включает таможню?',
      'Предоплата нужна?',
      'Можно безнал?',
      'Расходы на границе за чей счёт?',
    ],
  },
  {
    name: '📍 Маршрут',
    raw: [
      'Где сейчас машина?',
      'Когда будешь на загрузке?',
      'Ориентировочное время доставки?',
      'Есть попутный груз?',
      'Через какую границу поедешь?',
    ],
  },
  {
    name: '📄 Документы',
    raw: [
      'Скинь фото ТТН',
      'Нужна доверенность?',
      'Какие документы на границе нужны?',
      'CMR готова?',
    ],
  },
];

export default function QuickPhrases({ onSelect }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const cat = CATEGORIES[activeTab];

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
            <Text style={[s.tabText, { color: i === activeTab ? '#FFF' : theme.textMuted }]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Phrases */}
      <ScrollView horizontal={false} contentContainerStyle={s.wrap}>
        {(cat.phrases || []).map((k) => (
          <TouchableOpacity key={k} style={[s.btn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onSelect(t(k))}>
            <Text style={[s.text, { color: theme.textSecondary }]}>{t(k)}</Text>
          </TouchableOpacity>
        ))}
        {(cat.raw || []).map((phrase, i) => (
          <TouchableOpacity key={i} style={[s.btn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onSelect(phrase)}>
            <Text style={[s.text, { color: theme.textSecondary }]}>{phrase}</Text>
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
