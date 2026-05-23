import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';

// PR-C2 (Task 4): info-page для CarGoRuqsat — государственной системы
// электронной очереди на границе РК. UrTruck уже получил официальное
// одобрение JSC «Информационно-учётный центр» на интеграцию через
// Smart Bridge (CargoRuqsatAppsServiceSync). Запуск Q4 2026.
// Эта страница даёт пользователю представление о будущей фиче +
// ссылку на официальный портал чтобы он мог пользоваться ею сейчас
// напрямую, пока in-app интеграция готовится.

const OFFICIAL_URL = 'https://cgr.qoldau.kz/ru/start';

export default function CargoRuqsatInfoScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent="#F59E0B" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={[s.title, { color: theme.text }]}>🚧 {t('cargoruqsat_page_title')}</Text>
        <Text style={[s.status, { color: theme.textMuted }]}>{t('cargoruqsat_page_status')}</Text>

        <Text style={[s.section, { color: theme.text }]}>{t('cargoruqsat_page_what_title')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_page_what_body')}</Text>

        <Text style={[s.section, { color: theme.text }]}>{t('cargoruqsat_page_benefits_title')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_page_benefits_body')}</Text>

        <Text style={[s.section, { color: theme.text }]}>{t('cargoruqsat_page_when_title')}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{t('cargoruqsat_page_when_body')}</Text>

        <TouchableOpacity
          onPress={() => Linking.openURL(OFFICIAL_URL)}
          style={s.cta}
          activeOpacity={0.85}
        >
          <Text style={s.ctaText}>{t('cargoruqsat_page_open_official')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  cta: { backgroundColor: '#F59E0B', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#0A0A0A', fontWeight: '800', fontSize: 14 },
});
