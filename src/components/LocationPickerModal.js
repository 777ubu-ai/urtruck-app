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
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import { storage } from '../utils/storage';
import { localizePlace } from '../utils/places';
import { COUNTRIES, COUNTRY_ORDER, POINTS, searchPoints, formatPoint, pointsForCountry } from '../utils/geography';
import CountryFlag from './ui/v1/CountryFlag';

const RECENT_KEY = 'ur_recent_places';
const FAV_KEY = 'ur_fav_places';

const POPULAR_NAMES = [
  'Алматы', 'Астана', 'Ташкент', 'Москва', 'Бишкек', 'Шымкент',
  'Урумчи', 'Иу', 'Санкт-Петербург', 'Хоргос',
];
const POPULAR = POPULAR_NAMES.map((n) => POINTS.find((p) => p.name === n)).filter(Boolean);
const BORDERS = POINTS.filter((p) => p.type === 'border').slice(0, 6);

const pointKey = (p) => `${p.country}:${p.type}:${p.name}`;

const loadList = async (key) => {
  try {
    const raw = await storage.get(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

export default function LocationPickerModal({ visible, onClose, onSelect, title, showGeo = false, allowCountryOnly = false }) {
  const v1 = useV1Colors();
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState([]);
  const [favs, setFavs] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [scope, setScope] = useState('all');
  // Выбранная страна для режима «страна → города». null = обычный список
  // (популярные/недавние/страны). Тап по стране раскрывает её города.
  const [country, setCountry] = useState(null);
  const countryLabel = (code) => {
    const translated = t(`country_${code}`);
    return translated && translated !== `country_${code}`
      ? translated
      : (COUNTRIES[code]?.name || code || '');
  };

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setCountry(null);
    setScope('all');
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

  const pickCountry = (code) => {
    const label = countryLabel(code);
    onSelect?.(label, { name: label, country: code, type: 'country', countryOnly: true });
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

  const hits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return null;
    const primary = searchPoints(query, {});
    const localized = POINTS.filter((p) => {
      const zh = String(localizePlace(p.name, 'ZH') || '').toLocaleLowerCase();
      const en = String(localizePlace(p.name, 'EN') || '').toLocaleLowerCase();
      return zh.includes(q) || en.includes(q);
    });
    const unique = new Map();
    [...primary, ...localized].forEach((p) => unique.set(pointKey(p), p));
    const pointHits = [...unique.values()]
      .filter((p) => scope === 'all' || p.type === scope)
      .slice(0, 60);
    const countryHits = (scope === 'all' || scope === 'country')
      ? COUNTRY_ORDER.filter((code) => {
        const label = countryLabel(code).toLocaleLowerCase();
        const fallback = String(COUNTRIES[code]?.name || '').toLocaleLowerCase();
        return label.includes(q) || fallback.includes(q) || code.toLocaleLowerCase() === q;
      })
      : [];
    return { countryHits, pointHits };
  }, [query, scope, lang]);

  const s = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: v1.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingRight: 8 },
    backLabel: { fontSize: 16, fontWeight: '700', color: v1.text },
    title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: v1.text, flex: 1 },
    searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: v1.surface, borderWidth: 1.5, borderColor: v1.driver, borderRadius: v1Radius.field, paddingHorizontal: 14, height: 50 },
    searchInput: { flex: 1, fontSize: 15, color: v1.text, paddingVertical: 0 },
    scopes: { flexGrow: 0, marginTop: 10 },
    scopesContent: { paddingHorizontal: 16, gap: 8 },
    scope: { minHeight: 34, borderWidth: 1, borderColor: v1.border, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    scopeText: { fontSize: 12, fontWeight: '700' },
    sectLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: v1.textMuted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    sectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    sectLabelInline: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: v1.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 12 },
    lead: { width: 38, height: 38, borderRadius: 11, backgroundColor: v1.surface, borderWidth: 1, borderColor: v1.border, alignItems: 'center', justifyContent: 'center' },
    leadText: { fontSize: 19 },
    name: { fontSize: 15, fontWeight: '700', color: v1.text },
    sub: { fontSize: 12, color: v1.textMuted, marginTop: 2 },
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
        <View style={s.lead}><CountryFlag code={p.country} width={25} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{localizePlace(p.name, lang)}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {p.custom ? t('loc_custom_hint') : (countryLabel(p.country) + (p.type === 'border' ? ' · ' + t('loc_borders') : ''))}
          </Text>
        </View>
        {showHeart && !p.custom ? (
          <TouchableOpacity
            onPress={(event) => {
              // Nested inside the selectable location row. On web/PWA the
              // press bubbles unless stopped and used to select the location
              // while merely adding it to favourites.
              event?.stopPropagation?.();
              toggleFav(p);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={`loc-fav-${p.name}`}
          >
            <Feather name="bookmark" size={18} color={isFav ? v1.driver : v1.textMuted} />
          </TouchableOpacity>
        ) : <Text style={s.chev}>›</Text>}
      </TouchableOpacity>
    );
  };

  const CountryRow = ({ code, fromSearch = false }) => (
    <TouchableOpacity
      style={s.row}
      onPress={() => {
        if (fromSearch && allowCountryOnly) pickCountry(code);
        else { setCountry(code); setQuery(''); }
      }}
      activeOpacity={0.7}
      testID={`loc-country-${code}`}
    >
      <View style={s.lead}><CountryFlag code={code} width={25} /></View>
      <View style={{ flex: 1 }}><Text style={s.name} numberOfLines={1}>{countryLabel(code)}</Text></View>
      <Text style={s.chev}>›</Text>
    </TouchableOpacity>
  );

  const scopeItems = [
    ['all', t('filter_all')],
    ['country', t('loc_countries')],
    ['city', t('point_type_city')],
    ['border', t('loc_borders')],
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      {/* React Native Modal с presentationStyle="fullScreen" рендерится в
          отдельной native-иерархии, safe-area контекст из App root не
          наследуется — из-за этого на iPhone с dynamic island кнопка «Назад»
          в header'е слипалась с временем в статус-баре (жалоба владельца
          28.07, скрин IMG_6789). Свой SafeAreaProvider внутри модалки
          восстанавливает реальные insets, и edges=['top'] снова работает. */}
      <SafeAreaProvider>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity style={s.back} onPress={onClose} testID="loc-close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={v1.text} />
            <Text style={s.backLabel}>{t('back')}</Text>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scopes} contentContainerStyle={s.scopesContent}>
            {scopeItems.map(([key, label]) => (
              <TouchableOpacity key={key} onPress={() => setScope(key)} style={[s.scope, scope === key && { backgroundColor: v1.driverSoft, borderColor: v1.driver }]} testID={`loc-scope-${key}`}>
                <Text style={[s.scopeText, { color: scope === key ? v1.driver : v1.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {hits ? (
            <>
              {hits.countryHits.length === 0 && hits.pointHits.length === 0 ? <Text style={s.empty}>{t('loc_no_results')}</Text> : null}
              {hits.countryHits.map((code) => <CountryRow key={`hit-country:${code}`} code={code} fromSearch />)}
              {hits.pointHits.map((p, i) => <Row key={`hit:${pointKey(p)}:${i}`} p={p} />)}
              {query.trim().length >= 2 && hits.countryHits.length === 0 && hits.pointHits.length === 0 ? (
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
                  <Text style={s.sub} numberOfLines={1}>{countryLabel(country)}</Text>
                </View>
              </TouchableOpacity>
              <View style={s.divider} />
              {allowCountryOnly ? (
                <>
                  <TouchableOpacity style={s.row} onPress={() => pickCountry(country)} activeOpacity={0.7} testID={`loc-country-only-${country}`}>
                    <View style={[s.lead, s.geoLead]}><Feather name="globe" size={18} color={v1.driver} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.name, { color: v1.driver }]}>{t('loc_whole_country')}</Text>
                      <Text style={s.sub} numberOfLines={1}>{countryLabel(country)}</Text>
                    </View>
                    <Text style={s.chev}>›</Text>
                  </TouchableOpacity>
                  <View style={s.divider} />
                </>
              ) : null}
              {pointsForCountry(country).filter((p) => scope === 'all' || scope === 'country' || p.type === scope).map((p, i) => <Row key={`cc:${pointKey(p)}:${i}`} p={p} />)}
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

              {/* Порядок разделов по решению владельца: 1) Страны 2) Погран-
                  переходы 3) Избранное. Недавние/Популярные — ниже. */}
              {(scope === 'all' || scope === 'country') ? <><Sect icon="globe">{t('loc_countries')}</Sect>{COUNTRY_ORDER.map((code) => <CountryRow key={`country:${code}`} code={code} />)}</> : null}
              {(scope === 'all' || scope === 'border') ? <><Sect icon="flag">{t('loc_borders')}</Sect>{BORDERS.map((p, i) => <Row key={`bord:${pointKey(p)}:${i}`} p={p} showHeart={false} />)}</> : null}

              {(scope === 'all' || scope === 'city') && favs.length ? (
                <>
                  <Sect icon="star">{t('loc_favorites')}</Sect>
                  {favs.map((p, i) => <Row key={`fav:${pointKey(p)}:${i}`} p={p} />)}
                </>
              ) : null}

              {(scope === 'all' || scope === 'city') && recent.length ? (
                <>
                  <Sect icon="clock">{t('loc_recent')}</Sect>
                  {recent.map((p, i) => <Row key={`rec:${pointKey(p)}:${i}`} p={p} />)}
                </>
              ) : null}

              {(scope === 'all' || scope === 'city') ? <><Sect icon="star">{t('route_popular')}</Sect>{POPULAR.map((p, i) => <Row key={`pop:${pointKey(p)}:${i}`} p={p} />)}</> : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
