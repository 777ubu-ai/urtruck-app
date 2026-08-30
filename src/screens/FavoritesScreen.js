// FavoritesScreen — сохранённые перевозчики И грузы пользователя.
// Данные персистятся на сервере (/api/v1/favorites) — переживают
// перезапуск приложения.
//
// Fix (08-2026): раньше экран запрашивал ТОЛЬКО favList('driver') — грузы,
// сохранённые водителем через ❤️ на карточке груза (item_type='cargo'),
// реально писались в БД, но никогда сюда не попадали («сохраняю — а там
// пусто»). Теперь грузим все типы разом и рендерим по item_type.
// Иконка действия унифицирована с флоу «избранное» — сердце (не флажок),
// см. src/components/ui/v1/FeedCard.js и src/screens/CargoFeedScreen.js.

import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { marketAPI } from '../utils/marketAPI';
import { formatPrice } from '../utils/normalizers';
import { localizePlace } from '../utils/places';
import { useToast } from '../components/Toast';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useSafeRefresh } from '../hooks/useSafeRefresh';

export default function FavoritesScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const role = route?.params?.role;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    else setRefreshingList(true);
    // Без item_type — backend /api/v1/favorites отдаёт ВСЕ сохранённые
    // карточки (и водителей, и грузы) одним списком, отсортированным по дате.
    const r = await marketAPI.favList('');
    setItems(Array.isArray(r?.favorites) ? r.favorites : []);
    if (showLoading) setLoading(false);
    else setRefreshingList(false);
  }, []);

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => load({ showLoading: false }), [load]),
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openItem = (fav) => {
    const d = fav.item_data || {};
    if (fav.item_type === 'cargo') {
      navigation.navigate('CargoDetail', {
        cargo: { ...d, id: fav.item_id },
        cargoId: fav.item_id,
        role,
      });
      return;
    }
    // driver (и legacy-записи без item_type)
    navigation.navigate('DriverDetail', {
      driver: { id: fav.item_id, name: d.name, type: d.type, plate_truck: d.plate, _server: true, _isDriver: true },
      role,
    });
  };

  const removeItem = async (fav) => {
    const id = String(fav.item_id);
    setRemovingId(id);
    setItems((prev) => prev.filter((it) => String(it.item_id) !== id || it.item_type !== fav.item_type));
    try {
      const r = await marketAPI.favRemove(fav.item_type, fav.item_id);
      if (!r || r.ok !== true) throw new Error('remove_failed');
    } catch {
      // Не удалось на сервере — откатываем и сообщаем, чтобы список не
      // расходился с реальным состоянием (тот же принцип, что и toggleFav
      // на карточках ленты).
      load();
      try { toast(t('favorites_remove_failed'), 'error'); } catch {}
    } finally {
      setRemovingId(null);
    }
  };

  const renderItem = ({ item }) => {
    const d = item.item_data || {};
    const isCargo = item.item_type === 'cargo';
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: v1.card, borderColor: v1.border }]}
        onPress={() => openItem(item)}
        activeOpacity={0.8}
        testID="favorite-card"
      >
        <View style={[s.typeIcon, { backgroundColor: v1.surfaceMuted }]}>
          <Feather name={isCargo ? 'package' : 'truck'} size={18} color={v1.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          {isCargo ? (
            <>
              <Text style={[s.name, { color: v1.text }]} numberOfLines={1}>
                {localizePlace(d.from, lang) || t('not_specified')} → {localizePlace(d.to, lang) || t('not_specified')}
              </Text>
              <Text style={[s.sub, { color: v1.textMuted }]} numberOfLines={1}>
                {formatPrice(d.price, d.currency, t)}{d.type ? ` · ${t(d.type)}` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={[s.name, { color: v1.text }]} numberOfLines={1}>{d.name || t('anonymous')}</Text>
              {d.type ? <Text style={[s.sub, { color: v1.textMuted }]} numberOfLines={1}>{t(d.type)}{d.plate ? ` · ${d.plate}` : ''}</Text> : null}
            </>
          )}
        </View>
        <TouchableOpacity
          onPress={(e) => { e?.stopPropagation?.(); removeItem(item); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={removingId === String(item.item_id)}
          testID="favorite-remove"
          accessibilityRole="button"
          accessibilityLabel={t('favorites_remove') || 'Remove from favorites'}
          style={s.heartBtn}
        >
          <FontAwesome5 name="bookmark" size={18} color={v1.driver} solid />
        </TouchableOpacity>
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
          keyExtractor={(it) => `${it.item_type || 'driver'}_${it.id || it.item_id}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing || refreshingList} onRefresh={onRefresh} tintColor={v1.textMuted} />}
          ListEmptyComponent={
            <View style={s.center} testID="favorites-empty">
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
  typeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  heartBtn: { padding: 4 },
});
