// IdentityStepScreen — Шаг 1/4 PRO-верификации водителя (ИИН + ФИО).
//
// Канонический PRO-flow (PR-V3): Security → Identity → Selfie → VehicleDocs →
// TruckParams → submit. Этот экран собирает ИИН и ФИО и валидирует их на
// клиенте ДО отправки. Дальше данные передаются в SelfieStepScreen, который
// отправляет их вместе с селфи в POST /register/selfie (там же серверная
// валидация ИИН + госреестр + liveness). ИИН/ФИО в лог не пишем.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { brand, radius, typography } from '../../theme/brandV2';

const TOTAL_STEPS = 4;
const STEP = 1;

export default function IdentityStepScreen({ navigation }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [iin, setIin] = useState('');
  const [errors, setErrors] = useState({});

  const validateName = (v) => (!v || v.trim().length < 3 ? t('val_name_short') : null);
  const validateIin = (v) => {
    if (!v) return t('val_required');
    if (!/^\d+$/.test(v)) return t('val_iin_digits');
    if (v.length !== 12) return t('val_iin_12');
    return null;
  };

  const onNext = () => {
    const e = { name: validateName(fullName), iin: validateIin(iin) };
    setErrors(e);
    if (e.name || e.iin) {
      toast(t('reg_check_name_iin'), 'error');
      return;
    }
    // Передаём дальше — селфи-шаг отправит ИИН+ФИО+фото одним запросом.
    navigation.navigate('Selfie', { iin: iin.trim(), fullName: fullName.trim() });
  };

  const progress = STEP / TOTAL_STEPS;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="identity-step-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} testID="identity-back">
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </Pressable>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.stepLabel}>{t('identity_step')}</Text>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t('identity_title')}</Text>
          <Text style={s.subtitle}>{t('identity_subtitle')}</Text>

          <Text style={s.label}>{t('identity_name_label')}</Text>
          <TextInput
            value={fullName}
            onChangeText={(v) => {
              setFullName(v);
              if (errors.name) setErrors({ ...errors, name: null });
            }}
            placeholder={t('identity_name_ph')}
            placeholderTextColor={brand.textTertiary}
            autoCapitalize="words"
            style={[s.input, errors.name && s.inputErr]}
            testID="identity-name"
          />
          {errors.name ? <Text style={s.err}>{errors.name}</Text> : null}

          <Text style={s.label}>{t('identity_iin_label')}</Text>
          <TextInput
            value={iin}
            onChangeText={(v) => {
              const digits = v.replace(/[^\d]/g, '').slice(0, 12);
              setIin(digits);
              if (errors.iin) setErrors({ ...errors, iin: null });
            }}
            keyboardType="numeric"
            placeholder={t('identity_iin_ph')}
            placeholderTextColor={brand.textTertiary}
            maxLength={12}
            style={[s.input, errors.iin && s.inputErr]}
            testID="identity-iin"
          />
          {errors.iin ? <Text style={s.err}>{errors.iin}</Text> : null}
        </ScrollView>

        <View style={s.ctaWrap}>
          <Pressable onPress={onNext} style={s.cta} testID="identity-next">
            <Text style={s.ctaText}>{t('identity_next')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand.primary },
  stepLabel: { ...typography.bodySmall, color: brand.textSecondary },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { ...typography.h1, color: brand.textPrimary, marginBottom: 4 },
  subtitle: { ...typography.bodySmall, color: brand.textSecondary, marginBottom: 16 },
  label: { ...typography.bodySmall, fontWeight: '700', color: brand.textPrimary, marginTop: 18, marginBottom: 8 },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, color: brand.textPrimary, ...typography.body },
  inputErr: { borderColor: brand.error },
  err: { ...typography.caption, color: brand.error, marginTop: 6 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
