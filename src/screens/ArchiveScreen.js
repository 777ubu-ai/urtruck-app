import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { getArchive } from '../utils/store';

export default function ArchiveScreen({ navigation }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const { theme } = useTheme();
  const archive = getArchive();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t('archiveSection')}</Text>
      </View>
      {archive.length === 0 ? (
        <View style={s.empty}><Text style={{ fontSize: 60 }}>📋</Text><Text style={[s.emptyText, { color: theme.textMuted }]}>{t('noArchive')}</Text></View>
      ) : (
        <FlatList
          data={archive}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <View style={[s.item, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={s.row}>
                <Text style={[s.route, { color: theme.text }]}>{item.from} → {item.to}</Text>
                <Text style={s.price}>${item.price}</Text>
              </View>
              <Text style={[s.cargo, { color: theme.textSecondary }]}>{item.cargo}</Text>
              <View style={s.footer}>
                <Text style={s.rating}>{'★'.repeat(item.rating)}<Text style={[s.emptyStars, { color: theme.border }]}>{'★'.repeat(5 - item.rating)}</Text></Text>
                <Text style={[s.date, { color: theme.textMuted }]}>{item.date}</Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 22, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14 },
  item: { padding: 14, borderRadius: 14, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  route: { fontSize: 15, fontWeight: '700' },
  price: { color: '#22C55E', fontSize: 16, fontWeight: '900' },
  cargo: { fontSize: 12, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rating: { color: '#FBBF24', fontSize: 13 },
  emptyStars: { fontSize: 13 },
  date: { fontSize: 11 },
});
