import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';

// В реальном приложении — загрузка из БД
const REVIEWS = [
  { id: 'r1', user: 'Бахытжан', route: 'Иу → Алматы', rating: 5, text: 'Довёз быстро, аккуратный. Всё как договаривались.', ago: '2 нед', amount: 3200 },
  { id: 'r2', user: 'Asia Import', route: 'Гуанчжоу → Ташкент', rating: 5, text: 'Всё чётко, рекомендую. Фото груза присылал регулярно.', ago: '1 мес', amount: 4500 },
  { id: 'r3', user: 'CargoLine', route: 'Шэньчжэнь → Москва', rating: 4, text: 'Задержался на границе, но предупредил. В целом — нормально.', ago: '1 мес', amount: 5800 },
  { id: 'r4', user: 'МегаТорг', route: 'Иу → Бишкек', rating: 5, text: 'Супер. Груз в целости, сроки выдержал.', ago: '2 мес', amount: 2800 },
  { id: 'r5', user: 'ТОО Каспий', route: 'Ханчжоу → Алматы', rating: 5, text: 'Отличный водитель. Буду работать ещё.', ago: '3 мес', amount: 3500 },
];

export default function ReviewsScreen({ navigation, route }) {
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

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('allReviews')}</Text>
      </View>

      <View style={[s.summary, { backgroundColor: theme.card, borderColor: theme.border }]}>
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

const s = StyleSheet.create({
  container: { flex: 1 },
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
});
