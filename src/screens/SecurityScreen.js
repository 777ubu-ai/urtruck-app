import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { useAuth } from '../utils/AuthContext';
import { securityAPI, COLOR_UI, driverTier, countCompletedTrips, isDocsConfirmed } from '../utils/security';
import { regAPI } from '../utils/registration';
import { marketAPI } from '../utils/marketAPI';
import GradientText from '../components/GradientText';
import SecurityBadge from '../components/SecurityBadge';

export default function SecurityScreen({ navigation }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const { theme } = useTheme();
  const { session } = useAuth();
  const [score, setScore] = useState(null);
  const [rowScore, setRowScore] = useState(null);   // балл из drivers_registration (после верификации)
  const [rowColor, setRowColor] = useState(null);
  const [confirmed, setConfirmed] = useState(false); // документы подтверждены модератором
  const [trips, setTrips] = useState(0);             // выполненных рейсов
  const [rating, setRating] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const userId = session?.user?.id;
      if (userId) {
        const s = await securityAPI.getScore(userId);
        setScore(s);
      }
      // После верификации балл пишется в строку водителя (security_score), а не в
      // driver_scores — берём его как основной источник для «очков».
      const st = await regAPI.status().catch(() => null);
      if (st) {
        if (st.security_score != null) setRowScore(st.security_score);
        if (st.security_color) setRowColor(st.security_color);
        if (st.rating != null) setRating(Number(st.rating));
        setConfirmed(isDocsConfirmed(st));
      }
      // Выполненные рейсы — для уровня «Профи».
      const dash = await marketAPI.myDashboard().catch(() => null);
      if (dash) setTrips(countCompletedTrips(dash.my_deals));
      setLoading(false);
    })();
  }, []);

  // Уровень по вехам: Новичок → Проверенный → Профи (балл — «очки» внутри уровня).
  const effectiveScore = rowScore != null ? rowScore : (score?.total_score ?? 50);
  const isBlack = rowColor === 'black' || score?.color_code === 'black';
  const tier = driverTier({ confirmed, trips, rating });
  const ui = isBlack
    ? COLOR_UI.black
    : { bg: tier.color + '20', border: tier.color, text: tier.color, label: `${tier.emoji} ${t(tier.key)}` };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.backText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Feather name="shield" size={20} color="#DC2626" />
            <GradientText style={s.title} colors={['#DC2626', '#FF8400']}>{t('security_my_status')}</GradientText>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#FF8400" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Мой скоринг — большая карточка */}
            <View style={[s.heroCard, { backgroundColor: theme.card, borderColor: ui.border }]}>
              <Text style={[s.heroScore, { color: ui.text }]}>
                {tier.pct}<Text style={s.heroMax}>/100</Text>
              </Text>
              <Text style={[s.heroLabel, { color: ui.text }]}>{ui.label}</Text>
              <Text style={[s.heroHint, { color: theme.textMuted }]}>
                {t('security_hero_hint')}
              </Text>
            </View>

            {/* Driver PRO-верификация: сквозной поток документы → параметры фуры.
                Ревизия 26.07: у одобренного водителя (confirmed) CTA скрыт —
                повторный вход в верификацию перезаписывал данные (хвост
                бага «повторная регистрация после верификации»). */}
            {(session?.user?.role !== 'client' && !confirmed) ? (
              <TouchableOpacity
                style={[s.verifyBtn, { backgroundColor: '#168759' }]}
                onPress={() => navigation.navigate('Citizenship')}
                testID="security-verify-docs"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="file-text" size={15} color="#0C0A09" />
                  <Text style={s.verifyBtnText}>{t('security_verify_cta')}</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {/* Что улучшит скоринг */}
            <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Feather name="trending-up" size={14} color={theme.textMuted} />
                <Text style={[s.sectionTitle, { color: theme.textMuted, marginBottom: 0 }]}>{t('security_how_to_raise')}</Text>
              </View>
              {[
                { icon: 'check-circle', title: t('security_tip_complete_trips'),  desc: t('security_tip_complete_trips_desc') },
                { icon: 'star',         title: t('security_tip_get_reviews'),     desc: t('security_tip_get_reviews_desc') },
                { icon: 'file-text',    title: t('security_tip_verify_docs'),     desc: t('security_tip_verify_docs_desc') },
                { icon: 'credit-card',  title: t('security_tip_confirm_account'), desc: t('security_tip_confirm_account_desc') },
                { icon: 'camera',       title: t('biometry'),                     desc: t('security_tip_biometry_desc') },
              ].map(item => (
                <View key={item.title} style={[s.tipRow, { borderBottomColor: theme.border }]}>
                  <Feather name={item.icon} size={18} color={theme.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tipTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[s.tipDesc, { color: theme.textMuted }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Чего избегать */}
            <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Feather name="alert-triangle" size={14} color={theme.textMuted} />
                <Text style={[s.sectionTitle, { color: theme.textMuted, marginBottom: 0 }]}>{t('security_what_to_avoid')}</Text>
              </View>
              {[
                { icon: 'x-circle', title: t('security_avoid_cancel'), desc: t('security_avoid_cancel_desc') },
                { icon: 'phone',    title: t('security_avoid_ignore'), desc: t('security_avoid_ignore_desc') },
                { icon: 'clock',    title: t('security_avoid_late'),   desc: t('security_avoid_late_desc') },
              ].map(item => (
                <View key={item.title} style={[s.tipRow, { borderBottomColor: theme.border }]}>
                  <Feather name={item.icon} size={18} color={theme.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tipTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[s.tipDesc, { color: theme.textMuted }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Политика конфиденциальности */}
            <View style={[s.privacyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Feather name="lock" size={24} color={theme.text} />
              <Text style={[s.privacyTitle, { color: theme.text }]}>{t('security_privacy_title')}</Text>
              <Text style={[s.privacyDesc, { color: theme.textMuted }]}>
                {t('security_privacy_desc')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 22, fontWeight: '900' },
  heroCard: { padding: 28, borderRadius: 20, borderWidth: 2, alignItems: 'center', marginBottom: 14, gap: 6 },
  heroScore: { fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  heroMax: { fontSize: 22, opacity: 0.5, fontWeight: '700' },
  heroLabel: { fontSize: 16, fontWeight: '800' },
  heroHint: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 10 },
  verifyBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  verifyBtnText: { fontSize: 15, fontWeight: '800', color: '#0C0A09' },
  section: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  tipTitle: { fontSize: 13, fontWeight: '700' },
  tipDesc: { fontSize: 11, marginTop: 2 },
  privacyCard: { padding: 20, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 6, marginTop: 4 },
  privacyTitle: { fontSize: 14, fontWeight: '800' },
  privacyDesc: { fontSize: 11, textAlign: 'center', lineHeight: 17 },
});
