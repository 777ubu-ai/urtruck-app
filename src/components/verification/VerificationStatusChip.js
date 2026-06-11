// VerificationStatusChip — small colored badge used on every dashboard card.
//
// Statuses:
//   missing        — серый: «Не заполнено» (placeholder, ничего не залито)
//   uploaded       — синий: «Загружено» (есть локальный файл/драфт, но ещё не отправлено)
//   pending_review — янтарный: «На проверке» (отправлено модератору, ждём решения)
//   approved       — зелёный: «Одобрено» (модератор подтвердил)
//   rejected       — красный: «Нужно исправить» (требует re-upload)
//
// Каждый цвет — single source of truth для всей verification-фичи. Не
// дублируй цвета в карточках/кнопках — импортируй STATUS_COLORS отсюда.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useI18n } from '../../utils/useI18n';

export const STATUS_COLORS = {
  missing:        { fg: '#475569', bg: '#475569' + '14', border: '#475569' + '30' },
  uploaded:       { fg: '#2563EB', bg: '#2563EB' + '14', border: '#2563EB' + '30' },
  pending_review: { fg: '#D97706', bg: '#D97706' + '14', border: '#D97706' + '30' },
  approved:       { fg: '#16A34A', bg: '#16A34A' + '14', border: '#16A34A' + '30' },
  rejected:       { fg: '#DC2626', bg: '#DC2626' + '14', border: '#DC2626' + '30' },
};

const STATUS_KEYS = {
  missing:        'verification_status_missing',
  uploaded:       'verification_status_uploaded',
  pending_review: 'verification_status_pending',
  approved:       'verification_status_approved',
  rejected:       'verification_status_rejected',
};

export default function VerificationStatusChip({ status = 'missing', size = 'sm', testID }) {
  const { t } = useI18n();
  const color = STATUS_COLORS[status] || STATUS_COLORS.missing;
  const label = t(STATUS_KEYS[status] || 'verification_status_missing');
  return (
    <View
      style={[s.chip, {
        backgroundColor: color.bg,
        borderColor: color.border,
        paddingVertical: size === 'sm' ? 3 : 5,
        paddingHorizontal: size === 'sm' ? 8 : 10,
      }]}
      testID={testID || `verification-status-chip-${status}`}
    >
      <Text style={[s.txt, { color: color.fg, fontSize: size === 'sm' ? 11 : 12 }]}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
  },
  txt: { fontWeight: '700', letterSpacing: 0.2 },
});
