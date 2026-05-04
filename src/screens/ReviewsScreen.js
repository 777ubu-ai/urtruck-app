import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';

// Demo reviews — neutral content (stars/dates), shown until real reviews arrive from API
const REVIEWS = [
  { id: 'r1', user: 'B. K.',       route: 'Yiwu → Almaty',     rating: 5, text: '★★★★★', ago: '2w', amount: 3200 },
  { id: 'r2', user: 'Asia Import', route: 'Guangzhou → Tashkent', rating: 5, text: '★★★★★', ago: '1m', amount: 4500 },
  { id: 'r3', user: 'CargoLine',   route: 'Shenzhen → Moscow',  rating: 4, text: '★★★★',  ago: '1m', amount: 5800 },
  { id: 'r4', user: 'MegaTorg',    route: 'Yiwu → Bishkek',     rating: 5, text: '★★★★★', ago: '2m', amount: 2800 },
  { id: 'r5', user: 'Caspian Co.', route: 'Hangzhou → Almaty',  rating: 5, text: '★★★★★', ago: '3m', amount: 3500 },
];

export default function ReviewsScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  titleHero: { color: v1.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  summary: { flexDirection: 'row', margin: 16, marginBottom: 0, padding: 18, borderRadius: 16, borderWidth: 1, gap: 20 },
  summaryLeft: { alignItems: 'center', justifyContent: 'center', minWidth: 80 },
  avgRating: { fontSize: 40, fontWeight: '900' },
  avgStars: { color: '#FBBF24', fontSize: 14 },
  totalCount: { fontSize: 11, marginTop: 2 },
  summaryRight: { flex: 1, justifyContent: 'center', gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { fontSize: 10, fontWeight: '600', width: 16 },
  barBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#FBBF24' },
  barCount: { fontSize: 10, width: 16, textAlign: 'right' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  reviewUser: { fontSize: 14, fontWeight: '700' },
  reviewRoute: { fontSize: 11, marginTop: 2 },
  stars: { color: '#FBBF24', fontSize: 13 },
  starsEmpty: { fontSize: 13 },
  reviewAmount: { fontSize: 11, marginTop: 2 },
  reviewText: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  reviewAgo: { fontSize: 10 },

  }), [v1]);
  const { role } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();

  const avgRating = (REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length).toFixed(1);
  const counts = [5, 4, 3, 2, 1].map(n => REVIEWS.filter(r => r.rating === n).length);

  const renderItem = ({ item }) => (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={s.cardHeader}>
        <View>
          <Text style={[s.reviewUser, { color: theme.text }]}>{item.user}</Text>
          <Text style={[s.reviewRoute, { color: theme.textSecondary }]}>{item.route}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.stars}>{'★'.repeat(item.rating)}<Text style={[s.starsEmpty, { color: theme.border }]}>{'★'.repeat(5 - item.rating)}</Text></Text>
          <Text style={[s.reviewAmount, { color: theme.textMuted }]}>${item.amount}</Text>
        </View>
      </View>
      <Text style={[s.reviewText, { color: theme.textSecondary }]}>{item.text}</Text>
      <Text style={[s.reviewAgo, { color: theme.textMuted }]}>{item.ago}</Text>
    </View>
  );

  const v1Accent = v1AccentFor(role === 'driver' ? 'driver' : 'client');

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent={v1Accent.main} />
      <Text style={s.titleHero}>⭐ {t('allReviews')}</Text>

      <View style={[s.summary, { backgroundColor: v1.surface, borderColor: v1.border }]}>
        <View style={s.summaryLeft}>
          <Text style={[s.avgRating, { color: theme.text }]}>{avgRating}</Text>
          <Text style={s.avgStars}>{'★'.repeat(Math.round(parseFloat(avgRating)))}</Text>
          <Text style={[s.totalCount, { color: theme.textSecondary }]}>{REVIEWS.length} {t('reviews').toLowerCase()}</Text>
        </View>
        <View style={s.summaryRight}>
          {[5, 4, 3, 2, 1].map((n, i) => (
            <View key={n} style={s.barRow}>
              <Text style={[s.barLabel, { color: theme.textSecondary }]}>{n}★</Text>
              <View style={[s.barBg, { backgroundColor: theme.border }]}>
                <View style={[s.barFill, { width: ((counts[i] / REVIEWS.length) * 100) + '%' }]} />
              </View>
              <Text style={[s.barCount, { color: theme.textMuted }]}>{counts[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      <FlatList
        data={REVIEWS}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 10 }}
      />
    </SafeAreaView>
  );
}

