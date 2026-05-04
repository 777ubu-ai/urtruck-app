import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { v1Colors } from '../theme/designV1';
import { useToast } from '../components/Toast';
import { getBlacklist, addBlacklist, removeBlacklistItem, subscribe } from '../utils/store';

export default function BlacklistScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [list, setList] = useState(getBlacklist());
  const [name, setName] = useState('');

  useEffect(() => {
    const unsub = subscribe(() => setList(getBlacklist()));
    return () => unsub();
  }, []);

  const add = () => {
    if (!name.trim()) return;
    addBlacklist({ id: 'b' + Date.now(), name: name.trim() });
    toast('🚫 ' + name.trim(), 'warn');
    setName('');
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1Colors.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t('blacklistSection')}</Text>
      </View>

      <View style={s.addRow}>
        <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder={t('addToBlacklist')} placeholderTextColor={theme.textMuted} value={name} onChangeText={setName} onSubmitEditing={add} />
        <TouchableOpacity style={s.addBtn} onPress={add}><Text style={s.addBtnText}>＋</Text></TouchableOpacity>
      </View>

      {list.length === 0 ? (
        <View style={s.empty}><Text style={{ fontSize: 60 }}>🚫</Text><Text style={[s.emptyText, { color: theme.textMuted }]}>{t('noBlacklist')}</Text></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <View style={[s.item, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.name, { color: theme.text }]}>🚫 {item.name}</Text>
              <TouchableOpacity onPress={() => removeBlacklistItem(item.id)}>
                <Text style={s.remove}>{t('removeBlacklist')}</Text>
              </TouchableOpacity>
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
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingTop: 0 },
  input: { flex: 1, borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1 },
  addBtn: { width: 50, backgroundColor: '#EF4444', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1 },
  name: { fontSize: 14, fontWeight: '600' },
  remove: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
});
