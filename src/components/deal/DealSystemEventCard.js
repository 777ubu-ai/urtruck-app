import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useV1Colors, withAlpha } from '../../theme/designV1';
import { dealEventPresentation } from '../../utils/dealEventPresentation';

// Карточка показывает уже локализованный текст; не создаёт событий/запросов.
export default function DealSystemEventCard({ text, time }) {
  const colors = useV1Colors();
  const event = dealEventPresentation(text);
  return (
    <View style={s.row} testID="deal-chat-system-event">
      <View style={[s.card, { backgroundColor: colors.driverSoft, borderColor: withAlpha(colors.success, 0.3) }]}>
        <View style={[s.icon, { backgroundColor: withAlpha(colors.success, 0.1) }]} accessible={false}>
          <MaterialCommunityIcons name={event.icon} size={23} color={colors.success} />
        </View>
        <View style={s.content}>
          <Text style={[s.title, { color: colors.text }]}>{event.title}</Text>
          {event.detail ? <Text style={[s.detail, { color: colors.textMuted }]}>{event.detail}</Text> : null}
          {time ? <Text style={[s.time, { color: colors.textMuted }]}>{time}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { alignItems: 'center', marginVertical: 8 },
  card: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  time: { fontSize: 11, lineHeight: 15, marginTop: 4, textAlign: 'right' },
});
