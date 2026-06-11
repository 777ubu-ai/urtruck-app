// VerificationReviewSubmitScreen — последний шаг: «Проверьте данные»
// и «Отправить на проверку».
//
// Поведение:
//   - тянем /register/status, формируем модель (см. verificationState.js)
//   - рендерим список 10 items + 5 mini-iconов (uploaded ✓ / missing ⊘)
//   - кнопка «Изменить» на каждом → возвращает на dashboard
//   - submit → regAPI.moderate() → SubmittedScreen
//
// Если submit-endpoint вернёт ошибку, остаёмся на этом экране с toast'ом.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import {
  VERIFICATION_ITEMS,
  REQUIRED_ITEMS,
  ITEM_ICON,
  buildVerificationModel,
  canSubmitForReview,
  verificationProgress,
} from '../../utils/verificationState';
import VerificationStatusChip from '../../components/verification/VerificationStatusChip';
import VerificationProgress from '../../components/verification/VerificationProgress';

export default function VerificationReviewSubmitScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const { toast } = useToast();
  const [raw, setRaw] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRaw(await regAPI.status()); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const model = buildVerificationModel(raw || {});
  const { done, total } = verificationProgress(model);
  const canSubmit = canSubmitForReview(model);

  const onSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const r = await regAPI.moderate?.();
      if (r && r.ok !== false) {
        toast('✓ ' + t('verification_submitted_toast'), 'success');
        navigation.replace('VerificationSubmitted');
      } else {
        toast((r && r.detail) || t('verification_submit_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']} testID="verification-review-screen">
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
          <Text style={[s.iconBtnText, { color: v1.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.brand, { color: v1.text }]}>UrTruck</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={[s.title, { color: theme.text }]}>{t('verification_review_title')}</Text>
        <Text style={[s.subtitle, { color: v1.textMuted }]}>{t('verification_review_subtitle')}</Text>

        <VerificationProgress done={done} total={total} accent="#00A86B" />

        {VERIFICATION_ITEMS.map((key) => {
          const required = REQUIRED_ITEMS.includes(key);
          const status = model[key].status;
          return (
            <View key={key} style={[s.row, { borderColor: v1.border, backgroundColor: theme.card }]} testID={`verification-review-row-${key}`}>
              <Text style={s.icon}>{ITEM_ICON[key]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {t(`verification_item_${key}_title`)}{!required ? ' · ' + t('verification_optional_marker') : ''}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <VerificationStatusChip status={status} />
                </View>
              </View>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={[s.editBtn, { borderColor: v1.border }]}
                testID={`verification-review-edit-${key}`}
              >
                <Text style={[s.editText, { color: v1.textMuted }]}>{t('verification_review_edit')}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      <View style={[s.footer, { backgroundColor: theme.bg, borderTopColor: v1.border }]}>
        <TouchableOpacity
          onPress={onSubmit}
          disabled={!canSubmit || busy}
          activeOpacity={0.85}
          style={[s.submitBtn, {
            backgroundColor: canSubmit ? '#00A86B' : v1.border,
            opacity: busy ? 0.5 : 1,
          }]}
          testID="verification-review-submit"
        >
          <Text style={[s.submitText, { color: canSubmit ? '#FFF' : v1.textMuted }]}>
            {busy ? '…' : t('verification_submit_btn')}
          </Text>
        </TouchableOpacity>
        {!canSubmit ? (
          <Text style={[s.hint, { color: v1.textMuted }]}>
            {t('verification_review_complete_hint')}
          </Text>
        ) : null}
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
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { fontSize: 13, marginTop: 6, marginBottom: 18, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  icon: { fontSize: 22 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  editBtn: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  editText: { fontSize: 11, fontWeight: '700' },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1 },
  submitBtn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 11, marginTop: 8, textAlign: 'center' },
});
