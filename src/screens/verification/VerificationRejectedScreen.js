// VerificationRejectedScreen — экран коррекции отклонённых документов.
//
// Показывает ТОЛЬКО rejected items с причинами; approved/uploaded
// остаются вне списка. Один tap на карточку → возврат к
// VerificationDashboard'у, оттуда юзер тапает по той же item-card и
// идёт на upload-step (где может переснять).
//
// BACKEND GAP: /api/v1/register/status сейчас не отдаёт per-item
// `rejection_reasons` JSON map. Поле в drivers_registration схеме
// отсутствует. Frontend graceful'но не падает (`itemReason(raw,key)`
// возвращает null) — экран рендерится с общим текстом «Модератор
// попросил переснять документы», без конкретных причин до тех пор пока
// backend не отдаст детали.
//
// TODO backend: добавить колонку `rejection_reasons TEXT` (JSON) +
// заполнять её при moderate decision.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { regAPI } from '../../utils/registration';
import {
  VERIFICATION_ITEMS,
  ITEM_ICON,
  buildVerificationModel,
} from '../../utils/verificationState';
import { STATUS_COLORS } from '../../components/verification/VerificationStatusChip';

export default function VerificationRejectedScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const [raw, setRaw] = useState(null);

  const load = useCallback(async () => {
    try { setRaw(await regAPI.status()); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const model = buildVerificationModel(raw || {});
  const rejectedKeys = VERIFICATION_ITEMS.filter((k) => model[k].status === 'rejected');

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']} testID="verification-rejected-screen">
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
          <Text style={[s.iconBtnText, { color: v1.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.brand, { color: v1.text }]}>UrTruck</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={[s.title, { color: theme.text }]}>{t('verification_rejected_title')}</Text>
        <Text style={[s.subtitle, { color: v1.textMuted }]}>{t('verification_rejected_subtitle')}</Text>

        {rejectedKeys.length === 0 ? (
          <View style={[s.empty, { backgroundColor: theme.card, borderColor: v1.border }]}>
            <Text style={[s.emptyText, { color: v1.textMuted }]}>
              {t('verification_rejected_empty')}
            </Text>
          </View>
        ) : (
          rejectedKeys.map((key) => {
            const reason = model[key].rejectionReason || t('verification_rejected_generic_reason');
            return (
              <TouchableOpacity
                key={key}
                onPress={() => navigation.replace('VerificationDashboard')}
                activeOpacity={0.85}
                style={[s.row, {
                  borderColor: STATUS_COLORS.rejected.border,
                  backgroundColor: STATUS_COLORS.rejected.bg,
                }]}
                testID={`verification-rejected-row-${key}`}
              >
                <Text style={s.icon}>{ITEM_ICON[key]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: theme.text }]}>
                    {t(`verification_item_${key}_title`)}
                  </Text>
                  <Text style={[s.reason, { color: STATUS_COLORS.rejected.fg }]}>
                    {reason}
                  </Text>
                </View>
                <Text style={[s.chev, { color: STATUS_COLORS.rejected.fg }]}>›</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { fontSize: 13, marginTop: 6, marginBottom: 18, lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  icon: { fontSize: 22 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  reason: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  chev: { fontSize: 26, fontWeight: '300' },
  empty: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center' },
});
