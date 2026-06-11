// VerificationDashboardScreen — точка входа в верификацию водителя.
//
// Лiчная архитектура:
//   1. На mount тянем /api/v1/register/status → нормализуем через
//      buildVerificationModel
//   2. Решаем какой экран показать (collecting → этот dashboard;
//      pending_review/approved/rejected → редирект на статусный экран —
//      реализованы отдельно).
//   3. Рендерим прогресс + 10 карточек + footer с CTA «Отправить на
//      проверку» (если submit eligible).
//
// Никаких новых экранов мы не пишем — карточки прыгают на
// существующие screens: 'Identity', 'Selfie', 'VehicleDocs',
// 'VehiclePhotos', 'TruckParams'. Те экраны частью пишут на backend
// (`registration.js` API), а часть пока не реализована (license-back,
// srts, truck-interior, referral) — для них карточка открывает «Coming
// soon» toast (read AcceptanceCriteria: новые screens могут быть в
// следующем PR).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import VerificationProgress from '../../components/verification/VerificationProgress';
import VerificationCard from '../../components/verification/VerificationCard';
import {
  VERIFICATION_ITEMS,
  REQUIRED_ITEMS,
  ITEM_ICON,
  buildVerificationModel,
  verificationProgress,
  canSubmitForReview,
  overallStatus,
} from '../../utils/verificationState';
import { missingVerificationAssets } from '../../assets/onboarding/verification';

// На какой существующий экран ведёт карточка. null = пока не реализовано
// (показываем info-toast «Скоро» — следующий PR добавит экран).
const ROUTE_FOR_ITEM = {
  personalData:        'Identity',
  personalPhoto:       'Identity', // фото снимается в Identity (есть `identity-photo`)
  licenseFront:        'VehicleDocs',
  licenseBack:         null,
  selfieWithLicense:   'Selfie',
  vehicleRegistration: 'VehicleDocs',
  truckExterior:       'VehiclePhotos',
  truckInterior:       'VehiclePhotos',
  vehicleInfo:         'TruckParams',
  referralCode:        null,
};

export default function VerificationDashboardScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const { toast } = useToast();

  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await regAPI.status();
      setRaw(data || {});
    } catch {
      // 401 / network — оставляем raw=null; экран покажет «загрузка не
      // удалась». Бэкенд может быть оффлайн / no token.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const model = buildVerificationModel(raw || {});
  const { done, total } = verificationProgress(model);
  const status = overallStatus(raw?.status, model);

  // Авто-редирект на pending / approved / rejected. Делается через
  // navigation.replace, чтобы кнопка «назад» вела сразу в Profile,
  // а не на пустой dashboard.
  useEffect(() => {
    if (loading) return;
    if (status === 'pending_review') {
      navigation.replace('VerificationPending');
    } else if (status === 'approved') {
      navigation.replace('VerificationApproved');
    }
    // 'rejected' остаётся на dashboard'е — там карточки с rejection-причинами.
    // 'collecting' — тоже на dashboard'е.
  }, [status, loading, navigation]);

  const openItem = (key) => {
    const target = ROUTE_FOR_ITEM[key];
    if (!target) {
      toast(t('verification_step_coming_soon'), 'info');
      return;
    }
    navigation.navigate(target);
  };

  const handleSubmit = async () => {
    if (!canSubmitForReview(model) || submitting) return;
    setSubmitting(true);
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
      setSubmitting(false);
    }
  };

  const showSubmit = canSubmitForReview(model);
  const missing = missingVerificationAssets();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']} testID="verification-dashboard">
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn} testID="verification-dashboard-back">
          <Text style={[s.iconBtnText, { color: v1.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.brand, { color: v1.text }]}>UrTruck</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={[s.title, { color: theme.text }]}>{t('verification_dashboard_title')}</Text>
        <Text style={[s.subtitle, { color: v1.textMuted }]}>
          {t('verification_dashboard_subtitle')}
        </Text>

        {raw == null && !loading ? (
          <View style={[s.errorCard, { borderColor: v1.border, backgroundColor: theme.card }]}>
            <Text style={[s.errorText, { color: v1.textMuted }]}>
              {t('verification_load_failed')}
            </Text>
            <TouchableOpacity onPress={load} style={s.retryBtn}>
              <Text style={[s.retryText, { color: '#00A86B' }]}>{t('verification_retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <VerificationProgress done={done} total={total} accent="#00A86B" />

        {VERIFICATION_ITEMS.map((key) => {
          const required = REQUIRED_ITEMS.includes(key);
          return (
            <VerificationCard
              key={key}
              icon={ITEM_ICON[key]}
              title={t(`verification_item_${key}_title`)}
              subtitle={t(`verification_item_${key}_subtitle`)}
              status={model[key].status}
              rejectionReason={model[key].rejectionReason}
              required={required}
              onPress={() => openItem(key)}
              testID={`verification-card-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
            />
          );
        })}

        {/* Dev-only диагностика «сколько примеров ещё не дошли от дизайна» */}
        {__DEV__ && missing.length > 0 ? (
          <View style={[s.devNote, { borderColor: v1.border }]}>
            <Text style={[s.devNoteText, { color: v1.textMuted }]}>
              ⚠ {missing.length} example PNG(s) still missing from design queue. Cards render placeholder until each is added under src/assets/onboarding/verification/.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {showSubmit ? (
        <View style={[s.footer, { backgroundColor: theme.bg, borderTopColor: v1.border }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            style={[s.submitBtn, { backgroundColor: '#00A86B', opacity: submitting ? 0.5 : 1 }]}
            testID="verification-submit-button"
          >
            <Text style={s.submitText}>
              {submitting ? '…' : t('verification_submit_btn')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 22, fontWeight: '300' },
  brand: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { fontSize: 13, marginTop: 6, marginBottom: 18, lineHeight: 19 },
  errorCard: {
    borderWidth: 1, borderRadius: 14, padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  errorText: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  retryBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  retryText: { fontSize: 13, fontWeight: '800' },
  devNote: {
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  devNoteText: { fontSize: 10, lineHeight: 13 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 54, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
