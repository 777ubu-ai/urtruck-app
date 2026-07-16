// FavoritesScreen — сохранённые перевозчики (и грузы) пользователя.
// Данные персистятся на сервере (/api/v1/favorites) — переживают
// перезапуск приложения. Раньше «избранное» жило в памяти и было
// нигде не показано.

import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { marketAPI } from '../utils/marketAPI';
import BrandHeader from '../components/ui/v1/BrandHeader';

export default function FavoritesScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const role = route?.params?.role;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await marketAPI.favList('driver');
    setItems(Array.isArray(r?.favorites) ? r.favorites : []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openDriver = (fav) => {
    const d = fav.item_data || {};
    navigation.navigate('DriverDetail', {
      driver: { id: fav.item_id, name: d.name, type: d.type, plate_truck: d.plate, _server: true, _isDriver: true },
      role,
    });
  };

  const renderItem = ({ item }) => {
    const d = item.item_data || {};
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: v1.card, borderColor: v1.border }]}
        onPress={() => openDriver(item)}
        activeOpacity={0.8}
      >
        <Text style={s.heart}>❤️</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: v1.text }]} numberOfLines={1}>{d.name || t('anonymous')}</Text>
          {d.type ? <Text style={[s.sub, { color: v1.textMuted }]} numberOfLines={1}>{t(d.type)}{d.plate ? ` · ${d.plate}` : ''}</Text> : null}
        </View>
        <Text style={[s.chevron, { color: v1.textMuted }]}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: v1.bg }} edges={['top']}>
      <BrandHeader onBack={() => navigation.goBack()} accent={v1.driver} compact />
      <Text style={[s.title, { color: v1.text }]}>{t('favorites_title')}</Text>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={v1.textMuted} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id || it.item_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={v1.textMuted} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>🤍</Text>
              <Text style={[s.emptyText, { color: v1.textMuted }]}>{t('favorites_empty')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '900', marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 10, minHeight: 60 },
  heart: { fontSize: 20 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 22, fontWeight: '300' },
});
