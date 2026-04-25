import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/borders`;

const STATUS_COLORS = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };
const STATUS_LABELS = { green: 'Свободно', yellow: 'Умеренно', red: 'Загружено' };

export default function QueueScreen({ navigation }) {
  const { theme } = useTheme();
  const [borders, setBorders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchBorders = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}?country=${filter}`);
      const data = await r.json();
      setBorders(data.borders || []);
    } catch (e) {
      console.warn('Borders fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBorders(); }, [filter]);

  const FILTERS = [
    { k: '', l: 'Все' },
    { k: 'CN', l: '🇨🇳 Китай' },
    { k: 'RU', l: '🇷🇺 Россия' },
    { k: 'UZ', l: '🇺🇿 Узбекистан' },
    { k: 'KG', l: '🇰🇬 Кыргызстан' },
  ];

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>🛃 Очереди на границах</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.k}
            style={[s.chip, { backgroundColor: filter === f.k ? '#1A5C3C' : theme.card, borderColor: theme.border }]}
            onPress={() => setFilter(f.k)}
          >
            <Text style={[s.chipText, { color: filter === f.k ? '#FFF' : theme.textMuted }]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchBorders} />}
      >
        {loading && borders.length === 0 && <ActivityIndicator color="#1A5C3C" style={{ marginTop: 40 }} />}

        {borders.map(b => {
          const col = STATUS_COLORS[b.status] || '#78716C';
          return (
            <View key={b.id} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: col, borderLeftWidth: 4 }]}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: theme.text }]}>{b.name}</Text>
                  <Text style={[s.countries, { color: theme.textMuted }]}>{b.countries} · {b.type}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: col + '20' }]}>
                  <View style={[s.statusDot, { backgroundColor: col }]} />
                  <Text style={[s.statusText, { color: col }]}>{STATUS_LABELS[b.status]}</Text>
                </View>
              </View>

              <View style={s.stats}>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: theme.text }]}>{b.trucks_in_queue}</Text>
                  <Text style={[s.statLabel, { color: theme.textMuted }]}>машин</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: col }]}>{b.estimated_wait_hours}ч</Text>
                  <Text style={[s.statLabel, { color: theme.textMuted }]}>ожидание</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: theme.textMuted, fontSize: 13 }]}>{b.name_en}</Text>
                  <Text style={[s.statLabel, { color: theme.textMuted }]}>EN</Text>
                </View>
              </View>

              <Text style={[s.updated, { color: theme.textDim }]}>
                Обновлено: {(b.updated_at || '').slice(11, 16)} UTC
              </Text>
            </View>
          );
        })}

        {!loading && borders.length === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>Нет данных</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '300' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '800' },
  countries: { fontSize: 12, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 20 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 10, marginTop: 2 },
  updated: { fontSize: 10, marginTop: 8, textAlign: 'right' },
});
