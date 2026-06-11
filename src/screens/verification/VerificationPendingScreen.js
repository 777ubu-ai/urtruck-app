// VerificationPendingScreen — «Проверка идёт, можно закрыть, мы уведомим».
//
// Timeline:
//   ● Документы загружены — Мы получили всё, что нужно для проверки.
//   ◔ Проверяем данные   — Обычно это занимает до 24–48 часов.
//   ○ Проверка завершена — Мы уведомим вас о результате.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { regAPI } from '../../utils/registration';
import VerificationTimeline from '../../components/verification/VerificationTimeline';

export default function VerificationPendingScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(null);

  const check = async () => {
    try {
      const data = await regAPI.status();
      setStatus(data?.status || null);
      if (data?.status === 'approved') navigation.replace('VerificationApproved');
      if (data?.status === 'rejected') navigation.replace('VerificationDashboard');
    } catch {}
    finally { setRefreshing(false); }
  };

  useEffect(() => { check(); }, []);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID="verification-pending-screen">
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
          <Text style={[s.iconBtnText, { color: v1.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.brand, { color: v1.text }]}>UrTruck</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); check(); }} />}
      >
        <Text style={[s.title, { color: theme.text }]}>{t('verification_pending_title')}</Text>
        <Text style={[s.subtitle, { color: v1.textMuted }]}>
          {t('verification_pending_subtitle')}
        </Text>

        <VerificationTimeline
          current={1}
          steps={[
            {
              title: t('verification_pending_step1_title'),
              description: t('verification_pending_step1_desc'),
            },
            {
              title: t('verification_pending_step2_title'),
              description: t('verification_pending_step2_desc'),
            },
            {
              title: t('verification_pending_step3_title'),
              description: t('verification_pending_step3_desc'),
            },
          ]}
        />

        <View style={[s.note, { borderColor: v1.border, backgroundColor: theme.card }]}>
          <Text style={[s.noteText, { color: theme.text }]}>
            💡 {t('verification_pending_close_hint')}
          </Text>
        </View>
      </ScrollView>

      <View style={[s.footer, { backgroundColor: theme.bg, borderTopColor: v1.border }]}>
        <TouchableOpacity
          onPress={() => { try { navigation.popToTop(); } catch { navigation.goBack(); } }}
          style={[s.primary, { backgroundColor: '#00A86B' }]}
          testID="verification-pending-done-btn"
        >
          <Text style={s.primaryText}>{t('verification_pending_ok_btn')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 22, fontWeight: '300' },
  brand: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { fontSize: 13, marginTop: 6, marginBottom: 8, lineHeight: 19 },
  note: { marginTop: 24, padding: 14, borderRadius: 14, borderWidth: 1 },
  noteText: { fontSize: 13, lineHeight: 19 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1 },
  primary: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
