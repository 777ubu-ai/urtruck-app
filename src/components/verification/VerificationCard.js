// VerificationCard — one row in the verification dashboard.
//
// Compose:
//   ┌────────────────────────────────────────────┐
//   │  📷  Личная фотография                  →  │
//   │      Селфи без очков, маски, фильтров.     │
//   │      [chip: Не заполнено]                  │
//   │      [optional: «Размыто — переснимите»]   │
//   └────────────────────────────────────────────┘
//
// Visual cues:
//   - rejected → красная рамка слева для скан-глаза
//   - approved → зелёная рамка слева, чек справа
//   - pending  → янтарь, точка-индикатор
//
// Tap behavior:
//   - missing / uploaded / rejected → onPress (open step screen)
//   - pending_review → onPress (open status screen) или disabled
//   - approved      → disabled, но всё равно показываем для прозрачности
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import VerificationStatusChip, { STATUS_COLORS } from './VerificationStatusChip';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';

export default function VerificationCard({
  icon = '🟢',
  title,
  subtitle,
  status = 'missing',
  rejectionReason = null,
  required = true,
  onPress,
  testID,
}) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const stColor = STATUS_COLORS[status] || STATUS_COLORS.missing;
  const disabled = status === 'approved';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[s.card, {
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderLeftColor: stColor.fg,
        borderLeftWidth: 4,
        opacity: disabled ? 0.85 : 1,
      }]}
      testID={testID}
    >
      <View style={s.iconWrap}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.titleRow}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {!required ? (
            <Text style={[s.optional, { color: v1.textMuted }]}>•</Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[s.sub, { color: v1.textMuted }]} numberOfLines={2}>{subtitle}</Text>
        ) : null}
        <View style={s.chipRow}>
          <VerificationStatusChip status={status} testID={`${testID}-status`} />
        </View>
        {status === 'rejected' && rejectionReason ? (
          <View style={[s.reasonBox, { borderColor: STATUS_COLORS.rejected.border, backgroundColor: STATUS_COLORS.rejected.bg }]}>
            <Text style={[s.reasonText, { color: STATUS_COLORS.rejected.fg }]}>
              {rejectionReason}
            </Text>
          </View>
        ) : null}
      </View>
      {!disabled ? (
        <View style={s.chevWrap}>
          <Feather name="chevron-right" size={22} color={v1.textMuted} />
        </View>
      ) : (
        <View style={s.chevWrap}>
          <Feather name="check-circle" size={18} color={STATUS_COLORS.approved.fg} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '700', flex: 1 },
  optional: { fontSize: 16, lineHeight: 16 },
  sub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  chipRow: { marginTop: 8 },
  reasonBox: {
    marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  reasonText: { fontSize: 12, fontWeight: '600' },
  chev: { fontSize: 26, fontWeight: '300', marginLeft: 4, lineHeight: 28 },
  chevWrap: { marginLeft: 4, alignSelf: 'center' },
});
