import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { API_BASE } from '../config/env';
import { useSafeRefresh } from '../hooks/useSafeRefresh';

const BASE = API_BASE;

const MEDALS = ['🥇', '🥈', '🥉'];
const TRUCK_ICONS = { tent: '🚚', ref: '🧊', platform: '🛻', tanker: '🛢️', auto: '🚗', van: '🚐' };
const COLOR_BADGE = { green: '#168759', yellow: '#FF8400', red: '#EF4444' };

export default function StatsScreen({ navigation }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const { theme } = useTheme();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);

  const fetchLeaders = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    else setRefreshingList(true);
    try {
      const r = await fetch(`${BASE}/leaderboard?limit=20`);
      const data = await r.json();
      setLeaders(data.leaderboard || []);
    } catch {}
    if (showLoading) setLoading(false);
    else setRefreshingList(false);
  }, []);

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => fetchLeaders({ showLoading: false }), [fetchLeaders]),
  );

  useEffect(() => { fetchLeaders(); }, []);

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('leaderboard_title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing || refreshingList} onRefresh={onRefresh} />}
      >
        {leaders.length === 0 && !loading && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
            {t('stats_no_drivers')}
          </Text>
        )}

        {leaders.map((d, i) => {
          const medal = MEDALS[i] || `#${i + 1}`;
          const col = COLOR_BADGE[d.security_color] || '#78716C';
          const truck = TRUCK_ICONS[d.vehicle_type] || '🚛';
          return (
            <View key={d.id} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={s.rank}>
                <Text style={s.rankText}>{medal}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: theme.text }]}>
                  {d.full_name || t('stats_no_name')} {truck}
                </Text>
                <Text style={[s.sub, { color: theme.textMuted }]}>
                  {d.vehicle_brand || ''} · {d.vehicle_plate || ''}
                </Text>
                <View style={s.badges}>
                  <View style={[s.badge, { backgroundColor: col + '20', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                    <Feather name="shield" size={13} color={col} />
                    <Text style={[s.badgeText, { color: col }]}>{d.security_score}</Text>
                  </View>
                  {d.rating_count > 0 && (
                    <View style={[s.badge, { backgroundColor: '#D9770620', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                      <Feather name="star" size={13} color="#D97706" />
                      <Text style={[s.badgeText, { color: '#D97706' }]}>{d.rating_avg} ({d.rating_count})</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={s.score}>
                <Text style={[s.scoreNum, { color: col }]}>{d.combined_score}</Text>
                <Text style={[s.scoreLabel, { color: theme.textMuted }]}>{t('score_label')}</Text>
              </View>
            </View>
          );
        })}
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
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  rank: { width: 36, alignItems: 'center' },
  rankText: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 11, marginBottom: 6 },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  score: { alignItems: 'center' },
  scoreNum: { fontSize: 22, fontWeight: '900' },
  scoreLabel: { fontSize: 11 },
});
