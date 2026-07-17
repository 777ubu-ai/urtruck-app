import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import {v1Colors, useV1Colors} from '../theme/designV1';

const CONTACTS = [
  { icon: '💬', label: 'Telegram', value: '+7 747 917 11 18', url: 'https://t.me/+77479171118' },
  { icon: '📧', label: 'Email', value: '777ubu@gmail.com', url: 'mailto:777ubu@gmail.com' },
  { icon: '📱', label: 'WhatsApp', value: '+7 747 917 11 18', url: 'https://wa.me/77479171118' },
];

// Только честные, проверяемые факты (App Store модерация + доверие).
// Подписи — i18n-ключи, резолвятся через t() при рендере.
const STATS = [
  { n: '6', lKey: 'about_stat_countries' },
  { n: '4', lKey: 'about_stat_langs' },
  { n: '0%', lKey: 'about_stat_commission' },
  { n: 'Live', lKey: 'about_stat_queue' },
];

export default function AboutScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const accent = '#1A5C3C';

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('about_title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={[s.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={s.heroEmoji}>🚛</Text>
          <Text style={[s.heroTitle, { color: theme.text }]}>UrTruck</Text>
          <Text style={[s.heroSub, { color: theme.textMuted }]}>
            {t('about_hero_sub')}
          </Text>
        </View>

        <Text style={[s.section, { color: theme.text }]}>{t('about_what_we_do')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>
          {t('about_body')}
        </Text>

        <Text style={[s.section, { color: theme.text }]}>{t('about_numbers')}</Text>
        <View style={s.statsGrid}>
          {STATS.map((st, i) => (
            <View key={i} style={[s.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.statNum, { color: accent }]}>{st.n}</Text>
              <Text style={[s.statLabel, { color: theme.textMuted }]}>{t(st.lKey)}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.section, { color: theme.text }]}>{t('about_contact')}</Text>
        {CONTACTS.map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[s.contactRow, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => Linking.openURL(c.url).catch(() => {})}
          >
            <Text style={{ fontSize: 22 }}>{c.icon}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.contactLabel, { color: theme.text }]}>{c.label}</Text>
              <Text style={[s.contactValue, { color: theme.textMuted }]}>{c.value}</Text>
            </View>
            <Text style={{ color: theme.textMuted }}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={[s.footer, { borderTopColor: theme.border }]}>
          <Text style={[s.footerText, { color: theme.textDim }]}>
            {t('about_copyright')}
          </Text>
        </View>
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

  hero: { padding: 24, borderRadius: 18, borderWidth: 1, alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 56, marginBottom: 8 },
  heroTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },

  section: { fontSize: 18, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 10 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  statLabel: { fontSize: 11, textAlign: 'center' },

  contactRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  contactLabel: { fontSize: 14, fontWeight: '700' },
  contactValue: { fontSize: 12, marginTop: 2 },

  footer: { borderTopWidth: 1, paddingTop: 16, marginTop: 20 },
  footerText: { fontSize: 11, textAlign: 'center', lineHeight: 17 },
});
