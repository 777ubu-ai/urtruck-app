// VerificationStepLayout — shared chrome for every verification step screen.
//
// Layout:
//   ┌──────────────────────────────────────────┐
//   │  ←   ▓▓▓▓▓░░░░░  Шаг 3 из 10        ✕    │
//   ├──────────────────────────────────────────┤
//   │  <Title>                                 │
//   │  <Subtitle>                              │
//   │                                          │
//   │  <Children (scrollable)>                 │
//   │                                          │
//   ├──────────────────────────────────────────┤
//   │  <Action buttons>                        │
//   └──────────────────────────────────────────┘
//
// Action buttons live in a sticky footer above the safe-area inset to
// stay visible even when the soft keyboard is open. Children are
// rendered inside a ScrollView with `keyboardShouldPersistTaps='handled'`
// so taps on text-input siblings don't bounce.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';
import { useI18n } from '../../utils/useI18n';

export default function VerificationStepLayout({
  step,
  total,
  title,
  subtitle,
  onBack,
  onClose,
  footer,
  children,
  testID,
}) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const pct = step && total ? Math.round((step / total) * 100) : 0;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID={testID}>
      <View style={s.headerRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.iconBtn} testID="verification-step-back">
            <Text style={[s.iconBtnText, { color: v1.text }]}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.iconBtn} />
        )}
        <View style={[s.progressTrack, { backgroundColor: v1.border }]}>
          <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: '#00A86B' }]} />
        </View>
        <Text style={[s.stepLabel, { color: v1.textMuted }]}>
          {t('verification_step_n_of_m').replace('{n}', String(step || 0)).replace('{m}', String(total || 0))}
        </Text>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={s.iconBtn} testID="verification-step-close">
            <Text style={[s.iconBtnText, { color: v1.textMuted }]}>✕</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.iconBtn} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {title ? <Text style={[s.title, { color: theme.text }]}>{title}</Text> : null}
        {subtitle ? <Text style={[s.subtitle, { color: v1.textMuted }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: 8 }}>{children}</View>
      </ScrollView>

      {footer ? (
        <View style={[s.footer, { backgroundColor: theme.bg, borderTopColor: v1.border }]}>
          {footer}
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 22, fontWeight: '300' },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  stepLabel: { fontSize: 11, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  scrollBody: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontSize: 14, marginTop: 6, lineHeight: 21 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
});
