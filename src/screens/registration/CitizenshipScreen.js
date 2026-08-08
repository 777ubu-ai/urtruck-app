// Шаг 1 верификации водителя — выбор гражданства (новый порядок).
// От страны зависит список принимаемых документов и дальнейшая проверка.
// Сохраняем citizenship_country в черновик и переходим к шагу 2 (удостоверение).
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { regAPI } from '../../utils/registration';

const TOTAL_STEPS = 4;
const STEP = 1;

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
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const accent = '#168759';               // роль водителя — изумрудный неон
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
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      {/* Header + прогресс */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="citizenship-back" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.stepLabel, { color: theme.textMuted }]}>{`${t('reg_step') || 'Шаг'} ${STEP} ${t('reg_of') || 'из'} ${TOTAL_STEPS}`}</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={[s.progressTrack, { backgroundColor: theme.border }]}>
        <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={[s.title, { color: theme.text }]}>{t('cit_step_title')}</Text>
        <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('cit_step_subtitle')}</Text>

        <View style={{ gap: 10, marginTop: 20 }}>
          {COUNTRIES.map((c) => {
            const active = selected === c.code;
            return (
              <TouchableOpacity
                key={c.code}
                testID={`citizenship-${c.code}`}
                onPress={() => setSelected(c.code)}
                style={[s.option, {
                  backgroundColor: active ? accent + '18' : theme.card,
                  borderColor: active ? accent : theme.border,
                }]}
              >
                <Text style={[s.optionText, { color: theme.text }]}>{t(c.key)}</Text>
                {active ? <Feather name="check-circle" size={20} color={accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[s.footer, { borderTopColor: theme.border, backgroundColor: v1.bg }]}>
        <TouchableOpacity
          testID="citizenship-continue"
          disabled={!selected || saving}
          onPress={onNext}
          style={[s.cta, { backgroundColor: accent, opacity: (!selected || saving) ? 0.5 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#0C0A09" />
                  : <Text style={s.ctaText}>{t('cit_continue')}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  stepLabel: { fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 4, borderRadius: 2, marginHorizontal: 16 },
  progressFill: { height: 4, borderRadius: 2 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, minHeight: 56 },
  optionText: { fontSize: 16, fontWeight: '700' },
  footer: { padding: 16, borderTopWidth: 1 },
  cta: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  ctaText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
});
