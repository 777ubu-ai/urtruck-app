// FavoritesScreen — сохранённые грузы, рейсы и перевозчики пользователя.
// Данные персистятся на сервере (/api/v1/favorites) и переживают перезапуск.
// cargo/trip сохраняются по ID конкретной публикации; driver — по ID профиля.

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
  const [removingKey, setRemovingKey] = useState(null);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const result = await marketAPI.favList('');
      setItems(Array.isArray(result?.favorites) ? result.favorites : []);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => load({ showLoading: false }), [load]),
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openItem = (fav) => {
    const data = fav.item_data || {};
    if (fav.item_type === 'cargo') {
      navigation.navigate('CargoDetail', {
        cargo: { ...data, id: fav.item_id },
        cargoId: fav.item_id,
        role,
      });
      return;
    }
    if (fav.item_type === 'trip') {
      navigation.navigate('TripDetail', {
        trip: { ...data, id: fav.item_id, _server: true, isTrip: true },
        tripId: fav.item_id,
        role,
      });
      return;
    }
    navigation.navigate('DriverDetail', {
      driver: {
        id: fav.item_id,
        name: data.name,
        type: data.type,
        plate_truck: data.plate,
        _server: true,
        _isDriver: true,
      },
      role,
    });
  };

  const removeItem = async (fav) => {
    const key = `${fav.item_type || 'driver'}:${fav.item_id}`;
    setRemovingKey(key);
    setItems((prev) => prev.filter((item) => (
      String(item.item_id) !== String(fav.item_id) || item.item_type !== fav.item_type
    )));
    try {
      const result = await marketAPI.favRemove(fav.item_type, fav.item_id);
      if (!result || result.ok !== true) throw new Error('remove_failed');
    } catch {
      load();
      try { toast(t('favorites_remove_failed'), 'error'); } catch {}
    } finally {
      setRemovingKey(null);
    }
  };

  const renderItem = ({ item }) => {
    const data = item.item_data || {};
    const isCargo = item.item_type === 'cargo';
    const isTrip = item.item_type === 'trip';
    const routeText = `${localizePlace(data.from, lang) || t('not_specified')} → ${localizePlace(data.to, lang) || t('not_specified')}`;
    const removalKey = `${item.item_type || 'driver'}:${item.item_id}`;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: v1.card, borderColor: v1.border }]}
        onPress={() => openItem(item)}
        activeOpacity={0.8}
        testID={`favorite-card-${item.item_type || 'driver'}`}
      >
        <View style={[styles.typeIcon, { backgroundColor: v1.surfaceMuted }]}>
          <Feather name={isCargo ? 'package' : 'truck'} size={18} color={v1.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          {(isCargo || isTrip) ? (
            <>
              <Text style={[styles.name, { color: v1.text }]} numberOfLines={1}>{routeText}</Text>
              <Text style={[styles.sub, { color: v1.textMuted }]} numberOfLines={1}>
                {formatPrice(data.price, data.currency, t)}
                {isCargo && data.type ? ` · ${t(data.type)}` : ''}
                {isTrip && data.truck_type ? ` · ${t(data.truck_type)}` : ''}
                {isTrip && data.departure ? ` · ${data.departure}` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.name, { color: v1.text }]} numberOfLines={1}>{data.name || t('anonymous')}</Text>
              {data.type ? (
                <Text style={[styles.sub, { color: v1.textMuted }]} numberOfLines={1}>
                  {t(data.type)}{data.plate ? ` · ${data.plate}` : ''}
                </Text>
              ) : null}
            </>
          )}
        </View>
        <TouchableOpacity
          onPress={(event) => { event?.stopPropagation?.(); removeItem(item); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={removingKey === removalKey}
          testID="favorite-remove"
          accessibilityRole="button"
          accessibilityLabel={t('favorites_remove') || 'Remove from favorites'}
          style={styles.bookmarkBtn}
        >
          <FontAwesome5 name="bookmark" size={18} color={v1.driver} solid />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: v1.bg }} edges={['top']}>
      <BrandHeader onBack={() => navigation.goBack()} accent={v1.driver} compact />
      <Text style={[styles.title, { color: v1.text }]}>{t('favorites_title')}</Text>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={v1.textMuted} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.item_type || 'driver'}_${item.id || item.item_id}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={v1.textMuted} />}
          ListEmptyComponent={
            <View style={styles.center} testID="favorites-empty">
              <Feather name="bookmark" size={40} color={v1.textMuted} style={{ marginBottom: 10 }} />
              <Text style={[styles.emptyText, { color: v1.textMuted }]}>{t('favorites_empty')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '900', marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 10, minHeight: 60 },
  typeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  bookmarkBtn: { padding: 4 },
});
