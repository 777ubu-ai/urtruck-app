// RegistrationSubmittedScreen — финальный статус после submit (ТЗ блок 12/13).
//
// Full-screen Modal-overlay (как RegistrationCloseModal): не требует нового
// route в AppNavigator. Показывается из TruckParams ТОЛЬКО после успешного
// submitDriverRegistration (backend вернул ok). Никакого fake-status: экран
// рендерится лишь по реальному ответу submit. Срок проверки везде единый —
// «24–48 часов» (registration_review_time). UrTruck-формулировки: грузы/рейсы,
// проверка водителя и транспорта (не «заказы пассажиров»).

import React, { useMemo } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { brand, useBrand, radius, typography } from '../theme/brandV2';

export default function RegistrationSubmittedScreen({ visible, onPrimary, onStatus }) {
  const localBrand = useBrand();
  const s = useMemo(() => makeStyles(localBrand), [localBrand]);
  const { t } = useI18n();

  const Block = ({ icon, title, text }) => (
    <View style={s.block}>
      <View style={s.blockIcon}>
        <Feather name={icon} size={18} color={brand.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.blockTitle}>{title}</Text>
        <Text style={s.blockText}>{text}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="registration-submitted-screen">
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.check}>
            <Feather name="check" size={44} color={brand.textOnPrimary} />
          </View>
          <Text style={s.successTitle}>{t('registration_success_title')}</Text>
          <Text style={s.successText}>{t('registration_success_text')}</Text>

          <Text style={s.title}>{t('registration_submitted_title')}</Text>
          <Text style={s.text}>{t('registration_submitted_text')}</Text>
          <View style={s.reviewPill}>
            <Feather name="clock" size={14} color={brand.primary} />
            <Text style={s.reviewText}>{t('registration_review_time')}</Text>
          </View>

          <View style={s.blocks}>
            <Block icon="truck" title={t('registration_submitted_access_title')} text={t('registration_submitted_access_text')} />
            <Block icon="search" title={t('registration_submitted_wait_title')} text={t('registration_submitted_wait_text')} />
            <Block icon="bell" title={t('registration_submitted_notify_title')} text={t('registration_submitted_notify_text')} />
            <Block icon="file-plus" title={t('registration_submitted_extra_docs_title')} text={t('registration_submitted_extra_docs_text')} />
          </View>
        </ScrollView>

        <View style={s.ctaWrap}>
          <Pressable onPress={onPrimary} style={s.cta} testID="rs-primary">
            <Text style={s.ctaText}>{t('registration_submitted_primary_button')}</Text>
          </Pressable>
          {onStatus ? (
            <Pressable onPress={onStatus} style={s.secondary} testID="rs-status">
              <Text style={s.secondaryText}>{t('registration_submitted_status_button')}</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, alignItems: 'center' },
  check: { width: 88, height: 88, borderRadius: 44, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { ...typography.h1, color: brand.textPrimary, textAlign: 'center', marginBottom: 4 },
  successText: { ...typography.bodySmall, color: brand.textSecondary, textAlign: 'center', marginBottom: 24 },
  title: { ...typography.bodyLarge, fontWeight: '800', color: brand.textPrimary, alignSelf: 'flex-start', marginBottom: 6 },
  text: { ...typography.body, color: brand.textSecondary, alignSelf: 'flex-start', marginBottom: 12 },
  reviewPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: brand.primarySoft, marginBottom: 20 },
  reviewText: { ...typography.bodySmall, fontWeight: '800', color: brand.primary },
  blocks: { alignSelf: 'stretch', gap: 14 },
  block: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  blockIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: brand.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  blockTitle: { ...typography.bodySmall, fontWeight: '800', color: brand.textPrimary, marginBottom: 2 },
  blockText: { ...typography.bodySmall, color: brand.textSecondary },
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8, gap: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.button, color: brand.primary },
});
