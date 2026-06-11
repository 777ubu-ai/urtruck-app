// InstructionBulletList — короткий список «как сделать хорошо» с маркерами.
//
// Usage:
//   <InstructionBulletList items={[
//     'Сделайте селфи без очков.',
//     'Лицо должно быть полностью видно.',
//     'Используйте однотонный фон.',
//   ]} />
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';

export default function InstructionBulletList({ items = [], style }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  return (
    <View style={[s.wrap, style]}>
      {items.map((it, idx) => (
        <View key={idx} style={s.row}>
          <View style={[s.bullet, { backgroundColor: '#00A86B' }]} />
          <Text style={[s.text, { color: theme.text }]}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  text: { fontSize: 14, lineHeight: 21, flex: 1 },
});
