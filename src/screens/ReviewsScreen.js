import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import { reviewsAPI } from '../utils/reviews';

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
  avgStars: { color: '#D97706', fontSize: 14 },
  totalCount: { fontSize: 11, marginTop: 2 },
  summaryRight: { flex: 1, justifyContent: 'center', gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { fontSize: 11, fontWeight: '600', width: 16 },
  barBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#D97706' },
  barCount: { fontSize: 11, width: 16, textAlign: 'right' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  reviewUser: { fontSize: 14, fontWeight: '700' },
  reviewRoute: { fontSize: 11, marginTop: 2 },
  stars: { color: '#D97706', fontSize: 13 },
  starsEmpty: { fontSize: 13 },
  reviewAmount: { fontSize: 11, marginTop: 2 },
  reviewText: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  tagTxt: { fontSize: 11, fontWeight: '600' },
  reviewAgo: { fontSize: 11 },

  }), [v1]);
  const { role, targetId } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();

  const [data, setData] = useState(null);   // { summary, reviews }
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!targetId) { setLoading(false); return; }
    reviewsAPI.forTarget(targetId)
      .then((r) => { if (mounted.current) setData(r || null); })
      .catch(() => {})
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [targetId]);

  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  const total = data?.summary?.count ?? reviews.length;
  const avgRating = data?.summary?.average != null
    ? Number(data.summary.average).toFixed(1)
    : (reviews.length ? (reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1) : '0.0');
  const counts = [5, 4, 3, 2, 1].map(n => reviews.filter(r => (Number(r.rating) || 0) === n).length);

  const clamp = (n) => Math.max(0, Math.min(5, parseInt(n) || 0));
  const renderItem = ({ item }) => {
    const rating = clamp(item.rating);
    const user = item.user || item.author || (item.author_id ? String(item.author_id).slice(0, 8) : t('anonymous'));
    const when = item.ago || (item.created_at || '').slice(0, 10);
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.reviewUser, { color: theme.text }]} numberOfLines={1}>{user}</Text>
            {item.route ? <Text style={[s.reviewRoute, { color: theme.textSecondary }]} numberOfLines={1}>{item.route}</Text> : null}
          </View>
          <Text style={s.stars}>{'★'.repeat(rating)}<Text style={[s.starsEmpty, { color: theme.border }]}>{'★'.repeat(5 - rating)}</Text></Text>
        </View>
        {Array.isArray(item.tags) && item.tags.length > 0 ? (
          <View style={s.tagsRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={[s.tag, { backgroundColor: '#D9770618', borderColor: '#D97706' }]}>
                <Text style={[s.tagTxt, { color: '#D97706' }]}>{t(`rating_tag_${tag}`) || tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {item.text ? <Text style={[s.reviewText, { color: theme.textSecondary }]}>{item.text}</Text> : null}
        {when ? <Text style={[s.reviewAgo, { color: theme.textMuted }]}>{when}</Text> : null}
      </View>
    );
  };

  const v1Accent = v1AccentFor(role === 'driver' ? 'driver' : 'client');

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent={v1Accent.main} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <Feather name="star" size={20} color={v1.text} />
        <Text style={[s.titleHero, { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }]}>{t('allReviews')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={v1Accent.main} />
      ) : total === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
          <Feather name="star" size={48} color={v1.textMuted} />
          <Text style={{ color: v1.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{t('review_after_trip')}</Text>
        </View>
      ) : (
        <>
          <View style={[s.summary, { backgroundColor: v1.surface, borderColor: v1.border }]}>
            <View style={s.summaryLeft}>
              <Text style={[s.avgRating, { color: theme.text }]}>{avgRating}</Text>
              <Text style={s.avgStars}>{'★'.repeat(Math.round(parseFloat(avgRating)))}</Text>
              <Text style={[s.totalCount, { color: theme.textSecondary }]}>{total} {String(t('reviews')).toLowerCase()}</Text>
            </View>
            <View style={s.summaryRight}>
              {[5, 4, 3, 2, 1].map((n, i) => (
                <View key={n} style={s.barRow}>
                  <Text style={[s.barLabel, { color: theme.textSecondary }]}>{n}★</Text>
                  <View style={[s.barBg, { backgroundColor: theme.border }]}>
                    <View style={[s.barFill, { width: ((total ? counts[i] / total : 0) * 100) + '%' }]} />
                  </View>
                  <Text style={[s.barCount, { color: theme.textMuted }]}>{counts[i]}</Text>
                </View>
              ))}
            </View>
          </View>

          <FlatList
            data={reviews}
            keyExtractor={(i, idx) => String(i.id ?? i.created_at ?? idx)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10 }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

