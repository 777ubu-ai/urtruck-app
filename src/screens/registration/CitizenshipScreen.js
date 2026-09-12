// Шаг 1 верификации водителя — выбор гражданства (новый порядок).
// От страны зависит список принимаемых документов и дальнейшая проверка.
// Сохраняем citizenship_country в черновик и переходим к шагу 2 (удостоверение).
//
// Design v1 Commit 6: тот же token family, что и остальная верификация
// (IdentityStep / VehicleDocs / TruckParams) — brandV2 `brand`/`radius`/
// `typography` + KeyboardSafeLayout. Никаких hex/темных хардкодов.
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { regAPI } from '../../utils/registration';
import { brand, radius, typography } from '../../theme/brandV2';
import BackButton from '../../components/ui/v1/BackButton';
import KeyboardSafeLayout, { KeyboardSafeScrollView } from '../../components/ui/v1/KeyboardSafeLayout';
import CountryFlag from '../../components/ui/v1/CountryFlag';

const TOTAL_STEPS = 4;
const STEP = 1;
const stripLegacyFlag = (value) => String(value || '').replace(/[\u{1F1E6}-\u{1F1FF}]\u{FE0F}?/gu, '').trim();

const COUNTRIES = [
  { code: 'KZ', key: 'cit_kz' },
  { code: 'RU', key: 'cit_ru' },
  { code: 'UZ', key: 'cit_uz' },
  { code: 'KG', key: 'cit_kg' },
  { code: 'TJ', key: 'cit_tj' },
  { code: 'other', key: 'cit_other' },
];

export default function CitizenshipScreen({ navigation }) {
  const { t } = useI18n();
  const accent = brand.primary;
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  // Повторный вход — подтягиваем уже выбранное гражданство.
  useEffect(() => {
    let alive = true;
    (async () => {
      const st = await regAPI.status().catch(() => null);
      if (alive && st?.citizenship_country) setSelected(st.citizenship_country);
    })();
    return () => { alive = false; };
  }, []);

  const onNext = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try { await regAPI.saveDriverDraft({ citizenship_country: selected }); } catch {}
    setSaving(false);
    navigation.navigate('Identity', { citizenship: selected });
  };

  const progress = STEP / TOTAL_STEPS;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="citizenship-screen">
      <KeyboardSafeLayout>
        <View style={s.header}>
          <BackButton onPress={() => navigation.goBack()} label={t('back')} testID="citizenship-back" />
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.stepLabel}>{`${t('reg_step')} ${STEP} ${t('reg_of')} ${TOTAL_STEPS}`}</Text>
        </View>

        <KeyboardSafeScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t('cit_step_title')}</Text>
          <Text style={s.subtitle}>{t('cit_step_subtitle')}</Text>

          <View style={{ gap: 10, marginTop: 20 }}>
            {COUNTRIES.map((c) => {
              const active = selected === c.code;
              return (
                <Pressable
                  key={c.code}
                  testID={`citizenship-${c.code}`}
                  onPress={() => setSelected(c.code)}
                  style={[s.option, active && s.optionActive]}
                >
                  <View style={s.optionLabel}>
                    <CountryFlag code={c.code === 'other' ? 'XX' : c.code} width={28} height={18} compact />
                    <Text style={[s.optionText, { color: brand.textPrimary }]}>{stripLegacyFlag(t(c.key))}</Text>
                  </View>
                  {active ? <Feather name="check-circle" size={20} color={accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </KeyboardSafeScrollView>

        <View style={s.ctaWrap}>
          <Pressable
            testID="citizenship-continue"
            disabled={!selected || saving}
            onPress={onNext}
            style={[s.cta, { opacity: (!selected || saving) ? 0.5 : 1 }]}
          >
            {saving ? <ActivityIndicator color={brand.textOnPrimary} />
                    : <Text style={s.ctaText}>{t('cit_continue')}</Text>}
          </Pressable>
        </View>
      </KeyboardSafeLayout>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand.primary },
  stepLabel: { ...typography.bodySmall, color: brand.textSecondary },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { ...typography.h1, color: brand.textPrimary, marginBottom: 4 },
  subtitle: { ...typography.bodySmall, color: brand.textSecondary, marginBottom: 16 },
  // List rows — одинаковые с опциями docType в IdentityStepScreen: 56h, radius 14,
  // selected = accent soft bg (primarySoft ≈ primary 8%) + check в brand.primary.
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  optionLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  optionActive: { borderColor: brand.primary, backgroundColor: brand.primarySoft },
  optionText: { ...typography.body, fontWeight: '700' },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
