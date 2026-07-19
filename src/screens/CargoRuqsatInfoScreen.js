import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import {
  cgrBookingUrl,
  checkpointStatusColor,
  createBooking,
  fetchScoreboard,
} from '../utils/cgrAPI';

// PR-C2 (Task 4) → Stream A (день 7-10):
// Info-page для CarGoRuqsat — государственной системы электронной очереди
// на границе РК. UrTruck подал заявку на интеграцию через Smart Bridge
// (CargoRuqsatAppsServiceSync, ORGAM-S-9317).
//
// До получения Smart Bridge API (Q4 2026) работает Поток А: live-табло
// загруженности из публичных реестров cgr.qoldau.kz + привязка номера
// брони к рейсу. См. docs/cgr/TZ-CGR-001-v1.1.md.

const OFFICIAL_URL = cgrBookingUrl();

export default function CargoRuqsatInfoScreen({ navigation, route }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();

  const tripId = route?.params?.tripId || null;

  const [scoreboard, setScoreboard] = useState(null);
  const [scoreboardError, setScoreboardError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [bookingNumber, setBookingNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadScoreboard = useCallback(async () => {
    try {
      setScoreboardError(null);
      const data = await fetchScoreboard();
      setScoreboard(data);
    } catch (e) {
      setScoreboardError(e.message || 'fetch failed');
      setScoreboard(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadScoreboard();
  }, [loadScoreboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadScoreboard();
  }, [loadScoreboard]);

  const onSubmitBooking = useCallback(async () => {
    const n = bookingNumber.trim();
    if (n.length < 3) {
      Alert.alert(t('cargoruqsat_booking_invalid_title'), t('cargoruqsat_booking_invalid_body'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await createBooking({ tripId, bookingNumber: n });
      Alert.alert(
        t('cargoruqsat_booking_success_title'),
        t('cargoruqsat_booking_success_body'),
      );
      setBookingNumber('');
    } catch (e) {
      const msg = e.status === 401
        ? t('cargoruqsat_booking_auth_required')
        : e.status === 409
        ? t('cargoruqsat_booking_duplicate')
        : e.status === 503
        ? t('cargoruqsat_booking_disabled')
        : e.message || t('cargoruqsat_booking_error');
      Alert.alert(t('cargoruqsat_booking_error_title'), msg);
    } finally {
      setSubmitting(false);
    }
  }, [bookingNumber, tripId, t]);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent="#FF8400" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Feather name="tool" size={20} color={theme.text} />
          <Text style={[s.title, { color: theme.text, marginBottom: 0 }]}>{t('cargoruqsat_page_title')}</Text>
        </View>
        <Text style={[s.status, { color: theme.textMuted }]}>{t('cargoruqsat_page_status')}</Text>

        {/* ────────── Live-табло ────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 10 }}>
          <Feather name="bar-chart-2" size={16} color={theme.text} />
          <Text style={[s.section, { color: theme.text, marginTop: 0, marginBottom: 0 }]}>{t('cargoruqsat_live_title')}</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={theme.text} style={{ marginVertical: 16 }} />
        ) : scoreboardError ? (
          <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_live_error')}</Text>
        ) : scoreboard && scoreboard.checkpoints && scoreboard.checkpoints.length > 0 ? (
          <View style={{ marginVertical: 8 }}>
            {scoreboard.checkpoints.map((cp) => (
              <View key={cp.code} style={[s.cpRow, { borderColor: theme.border || '#292524' }]}>
                <View style={s.cpDot}>
                  <View style={[s.cpDotInner, { backgroundColor: checkpointStatusColor(cp.status) }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cpName, { color: theme.text }]}>{cp.name_ru}</Text>
                  <Text style={[s.cpMeta, { color: theme.textMuted }]}>
                    {cp.country_to ? `KZ → ${cp.country_to}` : ''}
                    {cp.directions?.in?.queue_length != null
                      ? ` · ${cp.directions.in.queue_length} ${t('cargoruqsat_live_trucks_short')}`
                      : ''}
                    {cp.directions?.in?.estimated_wait_minutes != null
                      ? ` · ~${Math.round(cp.directions.in.estimated_wait_minutes / 60 * 10) / 10}${t('cargoruqsat_live_hours_short')}`
                      : ''}
                  </Text>
                </View>
              </View>
            ))}
            {scoreboard.fetched_at && (
              <Text style={[s.cpFetched, { color: theme.textMuted }]}>
                {t('cargoruqsat_live_updated')}: {new Date(scoreboard.fetched_at).toLocaleTimeString()}
              </Text>
            )}
          </View>
        ) : (
          <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_live_empty')}</Text>
        )}

        {/* ────────── Что/Зачем/Когда ────────── */}
        <Text style={[s.section, { color: theme.text }]}>{t('cargoruqsat_page_what_title')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_page_what_body')}</Text>

        <Text style={[s.section, { color: theme.text }]}>{t('cargoruqsat_page_benefits_title')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_page_benefits_body')}</Text>

        <Text style={[s.section, { color: theme.text }]}>{t('cargoruqsat_page_when_title')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_page_when_body')}</Text>

        {/* ────────── CTA → официальный портал ────────── */}
        <TouchableOpacity
          onPress={() => Linking.openURL(OFFICIAL_URL)}
          style={s.cta}
          activeOpacity={0.85}
        >
          <Text style={s.ctaText}>{t('cargoruqsat_page_open_official')}</Text>
        </TouchableOpacity>

        {/* ────────── Привязка номера брони (TZ §3.2) ────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 10 }}>
          <Feather name="link" size={16} color={theme.text} />
          <Text style={[s.section, { color: theme.text, marginTop: 0, marginBottom: 0 }]}>{t('cargoruqsat_booking_title')}</Text>
        </View>
        <Text style={[s.body, { color: theme.textSecondary, marginBottom: 12 }]}>
          {t('cargoruqsat_booking_hint')}
        </Text>
        <TextInput
          value={bookingNumber}
          onChangeText={setBookingNumber}
          placeholder={t('cargoruqsat_booking_placeholder')}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
          style={[s.input, { backgroundColor: theme.card || '#1C1917', color: theme.text, borderColor: theme.border || '#292524' }]}
        />
        <TouchableOpacity
          onPress={onSubmitBooking}
          disabled={submitting || bookingNumber.trim().length < 3}
          style={[s.cta, { backgroundColor: '#22C55E', marginTop: 12, opacity: submitting || bookingNumber.trim().length < 3 ? 0.5 : 1 }]}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#0A0A0A" />
          ) : (
            <Text style={s.ctaText}>{t('cargoruqsat_booking_submit')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  status: { fontSize: 13, marginBottom: 24 },
  section: { fontSize: 17, fontWeight: '800', marginBottom: 10, marginTop: 16 },
  body: { fontSize: 14, lineHeight: 21 },
  cta: { backgroundColor: '#FF8400', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#0A0A0A', fontWeight: '800', fontSize: 14 },
  cpRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderRadius: 12, marginBottom: 8,
  },
  cpDot: { width: 16, marginRight: 10, alignItems: 'center' },
  cpDotInner: { width: 10, height: 10, borderRadius: 5 },
  cpName: { fontSize: 15, fontWeight: '700' },
  cpMeta: { fontSize: 12, marginTop: 2 },
  cpFetched: { fontSize: 11, marginTop: 6, textAlign: 'right' },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontWeight: '600', letterSpacing: 1,
  },
});
