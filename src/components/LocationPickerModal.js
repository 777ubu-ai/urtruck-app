// LocationPickerModal — полноэкранный выбор города/погранперехода в стиле
// inDrive (Вариант 1). Поиск во главе (автофокус), до ввода — геолокация,
// «Избранное», «Недавние», «Популярные» и «Погранпереходы». Выбор — один
// тап; сердечко добавляет город в избранное. «Недавние»/«Избранное» живут
// в памяти телефона (storage). Заменяет встроенный трёхшаговый пикер.
//
// Пропсы:
//   visible, onClose()
//   onSelect(formattedString, point) — как у прежнего RoutePointPicker
//   title      — заголовок экрана ("Откуда груз?" / "Куда везём груз?")
//   showGeo    — показывать «Определить по геолокации» (для «Откуда»)

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import { storage } from '../utils/storage';
import { localizePlace } from '../utils/places';
import { COUNTRIES, COUNTRY_ORDER, POINTS, searchPoints, formatPoint, pointsForCountry } from '../utils/geography';

const RECENT_KEY = 'ur_recent_places';
const FAV_KEY = 'ur_fav_places';

const POPULAR_NAMES = [
  'Алматы', 'Астана', 'Ташкент', 'Москва', 'Бишкек', 'Шымкент',
  'Урумчи', 'Иу', 'Санкт-Петербург', 'Хоргос',
];
const POPULAR = POPULAR_NAMES.map((n) => POINTS.find((p) => p.name === n)).filter(Boolean);
const BORDERS = POINTS.filter((p) => p.type === 'border').slice(0, 6);

const pointKey = (p) => `${p.country}:${p.type}:${p.name}`;
const iconFor = (p) => (p.type === 'border' ? '🛂' : p.type === 'terminal' ? '🏗' : (COUNTRIES[p.country]?.flag || '📍'));

const loadList = async (key) => {
  try {
    const raw = await storage.get(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

export default function LocationPickerModal({ visible, onClose, onSelect, title, showGeo = false }) {
  const v1 = useV1Colors();
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState([]);
  const [favs, setFavs] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  // Выбранная страна для режима «страна → города». null = обычный список
  // (популярные/недавние/страны). Тап по стране раскрывает её города.
  const [country, setCountry] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setCountry(null);
    (async () => {
      setRecent(await loadList(RECENT_KEY));
      setFavs(await loadList(FAV_KEY));
    })();
  }, [visible]);

  const favSet = useMemo(() => new Set(favs.map(pointKey)), [favs]);

  const pick = (p) => {
    const next = [p, ...recent.filter((r) => pointKey(r) !== pointKey(p))].slice(0, 6);
    setRecent(next);
    storage.set(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    onSelect?.(formatPoint(p), p);
    onClose?.();
  };

  const toggleFav = (p) => {
    const exists = favSet.has(pointKey(p));
    const next = exists ? favs.filter((f) => pointKey(f) !== pointKey(p)) : [p, ...favs].slice(0, 12);
    setFavs(next);
    storage.set(FAV_KEY, JSON.stringify(next)).catch(() => {});
  };

  const useGeo = async () => {
    if (geoLoading) return;
    setGeoLoading(true);
    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const city = geo && geo[0] ? (geo[0].city || geo[0].region || geo[0].subregion) : null;
        if (city) {
          const match = POINTS.find((p) => p.name.toLowerCase() === String(city).toLowerCase());
          pick(match || { name: city, country: 'XX', type: 'city', custom: true });
        }
      }
    } catch { /* геолокация недоступна — тихо */ }
    finally { setGeoLoading(false); }
  };

  const hits = query.trim().length >= 1 ? searchPoints(query, {}) : null;

  const s = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: v1.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, fontWeight: '300', color: v1.text },
    title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: v1.text, flex: 1 },
    searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: v1.surface, borderWidth: 1.5, borderColor: v1.driver, borderRadius: v1Radius.field, paddingHorizontal: 14, height: 50 },
    searchInput: { flex: 1, fontSize: 15, color: v1.text, paddingVertical: 0 },
    sectLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: v1.textMuted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    sectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    sectLabelInline: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: v1.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 12 },
    lead: { width: 38, height: 38, borderRadius: 11, backgroundColor: v1.surface, borderWidth: 1, borderColor: v1.border, alignItems: 'center', justifyContent: 'center' },
    leadText: { fontSize: 19 },
    name: { fontSize: 15, fontWeight: '700', color: v1.text },
    sub: { fontSize: 12, color: v1.textMuted, marginTop: 2 },
    heart: { fontSize: 18, paddingHorizontal: 4 },
    chev: { fontSize: 18, color: v1.textMuted },
    geoLead: { backgroundColor: 'rgba(0,230,118,0.12)', borderColor: 'rgba(0,230,118,0.3)' },
    divider: { height: 1, backgroundColor: v1.border, marginHorizontal: 16, marginVertical: 6 },
    empty: { color: v1.textMuted, fontSize: 13, padding: 16 },
  }), [v1]);

  const Sect = ({ icon, children }) => (
    <View style={s.sectRow}>
      <Feather name={icon} size={13} color={v1.textMuted} />
      <Text style={s.sectLabelInline}>{children}</Text>
    </View>
  );

  const Row = ({ p, showHeart = true }) => {
    const country = COUNTRIES[p.country] || {};
    const isFav = favSet.has(pointKey(p));
    return (
      <TouchableOpacity style={s.row} onPress={() => pick(p)} testID={`loc-point-${p.name}`} activeOpacity={0.7}>
        <View style={s.lead}><Text style={s.leadText}>{iconFor(p)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{localizePlace(p.name, lang)}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {p.custom ? t('loc_custom_hint') : (localizePlace(country.name || p.country || '', lang) + (p.type === 'border' ? ' · ' + t('loc_borders') : ''))}
          </Text>
        </View>
        {showHeart && !p.custom ? (
          <TouchableOpacity onPress={() => toggleFav(p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID={`loc-fav-${p.name}`}>
            <Feather name="heart" size={18} color={isFav ? '#F87171' : v1.textMuted} style={{ paddingHorizontal: 4 }} />
          </TouchableOpacity>
        ) : <Text style={s.chev}>›</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity style={s.back} onPress={onClose} testID="loc-close">
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
        </View>

        <View style={s.searchWrap}>
          <View style={s.search}>
            <Feather name="search" size={16} color={v1.textMuted} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('loc_search_ph')}
              placeholderTextColor={v1.placeholder}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              testID="loc-search"
            />
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {hits ? (
            <>
              {hits.length === 0 ? <Text style={s.empty}>{t('loc_no_results')}</Text> : null}
              {hits.map((p, i) => <Row key={`hit:${pointKey(p)}:${i}`} p={p} />)}
              {query.trim().length >= 2 ? (
                <>
                  <View style={s.divider} />
                  <Row p={{ name: query.trim(), country: 'XX', type: 'city', custom: true }} showHeart={false} />
                </>
              ) : null}
            </>
          ) : country ? (
            /* Режим «страна → города»: список городов выбранной страны +
               строка «← Все страны» для возврата. */
            <>
              <TouchableOpacity style={s.row} onPress={() => setCountry(null)} activeOpacity={0.7} testID="loc-country-back">
                <View style={s.lead}><Text style={s.leadText}>‹</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{t('loc_all_countries')}</Text>
                  <Text style={s.sub} numberOfLines={1}>{localizePlace(COUNTRIES[country]?.name || '', lang)}</Text>
                </View>
              </TouchableOpacity>
              <View style={s.divider} />
              {pointsForCountry(country).map((p, i) => <Row key={`cc:${pointKey(p)}:${i}`} p={p} />)}
            </>
          ) : (
            <>
              {showGeo ? (
                <TouchableOpacity style={s.row} onPress={useGeo} testID="loc-geo" activeOpacity={0.7}>
                  <View style={[s.lead, s.geoLead]}>
                    {geoLoading ? <ActivityIndicator color={v1.driver} /> : <Feather name="map-pin" size={18} color={v1.driver} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, { color: v1.driver }]}>{t('loc_geo')}</Text>
                    <Text style={s.sub}>{t('loc_geo_sub')}</Text>
                  </View>
                  <Text style={s.chev}>›</Text>
                </TouchableOpacity>
              ) : null}

              {favs.length ? (
                <>
                  <Sect icon="star">{t('loc_favorites')}</Sect>
                  {favs.map((p, i) => <Row key={`fav:${pointKey(p)}:${i}`} p={p} />)}
                </>
              ) : null}

              {recent.length ? (
                <>
                  <Sect icon="clock">{t('loc_recent')}</Sect>
                  {recent.map((p, i) => <Row key={`rec:${pointKey(p)}:${i}`} p={p} />)}
                </>
              ) : null}

              <Sect icon="star">{t('route_popular')}</Sect>
              {POPULAR.map((p, i) => <Row key={`pop:${pointKey(p)}:${i}`} p={p} />)}

              {/* Выбор по стране: тап раскрывает города страны (то, что просил
                  владелец — «нажимаю Китай → внизу все города»). */}
              <Sect icon="globe">{t('loc_countries')}</Sect>
              {COUNTRY_ORDER.map((code) => (
                <TouchableOpacity key={`country:${code}`} style={s.row} onPress={() => setCountry(code)} activeOpacity={0.7} testID={`loc-country-${code}`}>
                  <View style={s.lead}><Text style={s.leadText}>{COUNTRIES[code]?.flag || '🌐'}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{localizePlace(COUNTRIES[code]?.name || code, lang)}</Text>
                  </View>
                  <Text style={s.chev}>›</Text>
                </TouchableOpacity>
              ))}

              <Sect icon="flag">{t('loc_borders')}</Sect>
              {BORDERS.map((p, i) => <Row key={`bord:${pointKey(p)}:${i}`} p={p} showHeart={false} />)}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
