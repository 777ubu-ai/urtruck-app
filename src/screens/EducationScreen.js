import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors} from '../theme/designV1';

const VIDEOS = [
  { id: 'v1', key: 'edu1', icon: '👤', url: 'https://youtube.com/results?search_query=urtruck', duration: '3:20' },
  { id: 'v2', key: 'edu2', icon: '📦', url: 'https://youtube.com/results?search_query=ftl+logistics', duration: '4:15' },
  { id: 'v3', key: 'edu3', icon: '💰', url: 'https://youtube.com/results?search_query=indrive+cargo', duration: '2:50' },
  { id: 'v4', key: 'edu4', icon: '🛃', url: 'https://youtube.com/results?search_query=customs+truck', duration: '8:30' },
  { id: 'v5', key: 'edu5', icon: '📄', url: 'https://youtube.com/results?search_query=cmr+tir', duration: '6:10' },
  { id: 'v6', key: 'edu6', icon: '🤝', url: 'https://youtube.com/results?search_query=cargo+clients', duration: '5:45' },
  { id: 'v7', key: 'edu7', icon: '🚨', url: 'https://youtube.com/results?search_query=border+safety', duration: '4:00' },
  { id: 'v8', key: 'edu8', icon: '🧮', url: 'https://youtube.com/results?search_query=trucking+rates', duration: '7:20' },
];

export default function EducationScreen({ navigation }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>📚 {t('eduSection')}</Text>
      </View>

      <FlatList
        data={VIDEOS}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={[s.item, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => Linking.openURL(item.url)}>
            <View style={s.thumbnail}><Text style={{ fontSize: 28 }}>{item.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.videoLabel, { color: theme.textMuted }]}>{t('tutorial')} #{index + 1}</Text>
              <Text style={[s.videoTitle, { color: theme.text }]}>{t(item.key)}</Text>
              <Text style={[s.duration, { color: '#EF4444' }]}>▶ {item.duration} · {t('watchVideo')}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 22, fontWeight: '900' },
  item: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  thumbnail: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center' },
  videoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
  videoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  duration: { fontSize: 11, fontWeight: '600' },
});
