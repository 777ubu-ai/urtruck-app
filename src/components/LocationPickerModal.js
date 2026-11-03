import { GPS_TRACKING_PAUSED } from '../utils/locationPolicy';
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, Modal, View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import { storage } from '../utils/storage';
import { localizePlace } from '../utils/places';
import { COUNTRIES, COUNTRY_ORDER, POINTS, searchPointsAsync, formatPoint, pointsForCountry } from '../utils/geography';
import CountryFlag from './ui/v1/CountryFlag';
import { getCountryName } from '../utils/countries';
import { customCityForCountry, locationScopeAllowsPoint } from '../utils/worldCities';
import { createPickerSearchScheduler } from '../utils/pickerSearchScheduler';
import { captureForegroundPosition } from '../utils/foregroundLocation';

// QA2 пишет только интервалы, без названий городов, введённого текста и аккаунта.
const reportTiming = (phase, durationMs, extra = {}) => {
  if (Constants.expoConfig?.extra?.urtruckBuildFlavor === 'qa2') {
    console.info('[picker-metric]', JSON.stringify({ phase, durationMs, ...extra }));
  }
};

const RECENT_KEY = 'ur_recent_places';
const FAV_KEY = 'ur_fav_places';

const POPULAR_NAMES = [
  'Алматы', 'Астана', 'Ташкент', 'Москва', 'Бишкек', 'Шымкент',
  'Урумчи', 'Иу', 'Санкт-Петербург', 'Хоргос',
];
const POPULAR = POPULAR_NAMES.map((n) => POINTS.find((p) => p.name === n)).filter(Boolean);
// Локализованные справочные строки готовятся один раз, отдельно от пользовательского ввода.
const LOCALIZED_POINTS = POINTS.map(point => ({ point, labels: ['ZH', 'EN'].map(lang =>
  String(localizePlace(point.name, lang) || '').toLocaleLowerCase()) }));
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
  const geoRequest = useRef(null);
  useEffect(() => () => { geoRequest.current?.abort(); }, [visible]);
  const [scope, setScope] = useState('all');
  // Выбранная страна для режима «страна → города». null = обычный список
  // (популярные/недавние/страны). Тап по стране раскрывает её города.
  const [country, setCountry] = useState(null);
  const [emptyQueryReady, setEmptyQueryReady] = useState(true);
  const inputStarted = useRef(null);
  const handleQueryChange = (text) => {
    if (text === query) return;
    searchScheduler.cancel();
    inputStarted.current = performance.now();
    // Повторный монтаж флагов после очистки относится к подсказкам,
    // а не к срочному обновлению редактируемого значения.
    setEmptyQueryReady(false);
    setQuery(text);
  };
  useEffect(() => {
    if (inputStarted.current !== null) reportTiming('inputCommit', performance.now() - inputStarted.current);
  }, [query]);
  const [settledSearch, setSettledSearch] = useState(null);
  const searchScheduler = useMemo(() => createPickerSearchScheduler(), []);
  const searchKey = JSON.stringify([query, country, scope, lang]);
  const searchPending = visible && (query.trim() ? settledSearch?.key !== searchKey : !emptyQueryReady);

  useEffect(() => {
    if (!visible || !query.trim()) {
      searchScheduler.cancel();
      setSettledSearch(null);
      if (visible && !emptyQueryReady) searchScheduler.schedule(searchKey, () => setEmptyQueryReady(true));
      return () => searchScheduler.cancel();
    }
    searchScheduler.schedule(searchKey, async (key, isCurrent) => {
      const started = performance.now();
      let maxSliceMs = 0;
      let searchWorkMs = 0;
      let slices = 0;
      const primary = await searchPointsAsync(query, { country: country || undefined, isCurrent,
        onSlice: ms => { maxSliceMs = Math.max(maxSliceMs, ms); searchWorkMs += ms; slices += 1; } });
      if (!isCurrent() || primary === null) return;
      reportTiming('search', performance.now() - started, { maxSliceMs, searchWorkMs, slices });
      setSettledSearch({ key, primary });
    });
    return () => searchScheduler.cancel();
  }, [visible, searchKey, searchScheduler]);

  useEffect(() => {
    if (!visible || settledSearch?.key !== searchKey || inputStarted.current === null) return undefined;
    const started = inputStarted.current;
    const frame = requestAnimationFrame(() => reportTiming('resultsFrame', performance.now() - started));
    return () => cancelAnimationFrame(frame);
  }, [visible, settledSearch, searchKey]);

  const countryLabel = (code) => {
    const translated = t(`country_${code}`);
    return translated && translated !== `country_${code}`
      ? translated
      : getCountryName(code, lang);
  };

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setEmptyQueryReady(true);
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
    if (GPS_TRACKING_PAUSED || geoLoading) return;
    setGeoLoading(true);
    const controller = new AbortController();
    geoRequest.current = controller;
    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await captureForegroundPosition(Location, { appState: AppState, signal: controller.signal });
        if (!pos || controller.signal.aborted || AppState.currentState !== 'active') return;
        const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const city = geo && geo[0] ? (geo[0].city || geo[0].region || geo[0].subregion) : null;
        if (city && !controller.signal.aborted && AppState.currentState === 'active') {
          const match = POINTS.find((p) => p.name.toLowerCase() === String(city).toLowerCase());
          pick(match || { name: city, country: 'XX', type: 'city', custom: true });
        }
      }
    } catch { /* геолокация недоступна — тихо */ }
    finally { if (geoRequest.current === controller) { geoRequest.current = null; setGeoLoading(false); } }
  };

  const hits = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!visible) return null;
    // Never show selectable results (or a custom fallback) for an older query.
    if (searchPending) return { countryHits: [], pointHits: [] };
    if (!q) return null;
    const primary = settledSearch.primary;
    const localized = LOCALIZED_POINTS.filter(({ point: p, labels }) => {
      if (country && p.country !== country && p.partnerCountry !== country) return false;
      return labels.some(label => label.includes(q));
    }).map(({ point }) => point);
    const unique = new Map();
    [...primary, ...localized].forEach((p) => unique.set(pointKey(p), p));
    const pointHits = [...unique.values()]
      .filter((p) => locationScopeAllowsPoint(scope, country, p))
      .slice(0, 60);
    const countryHits = !country && (scope === 'all' || scope === 'country')
      ? COUNTRY_ORDER.filter((code) => {
        const label = countryLabel(code).toLocaleLowerCase();
        const fallback = String(COUNTRIES[code]?.name || '').toLocaleLowerCase();
        return label.includes(q) || fallback.includes(q) || code.toLocaleLowerCase() === q;
      })
      : [];
    return { countryHits, pointHits };
  }, [query, scope, lang, country, visible, searchPending, settledSearch]);

  const countryPoints = useMemo(() => country
    ? pointsForCountry(country).filter(p => locationScopeAllowsPoint(scope, country, p)).slice(0, 80)
    : [], [country, scope]);

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
    // CountryFlag owns its complete enamel treatment. Keep the layout slots
    // transparent so a flag never becomes a button/card inside an already
    // tappable row.
    lead: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    countryRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
    countryLead: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    leadText: { fontSize: 19 },
    name: { fontSize: 15, fontWeight: '700', color: v1.text },
    sub: { fontSize: 12, color: v1.textMuted, marginTop: 2 },
    chev: { fontSize: 18, color: v1.textMuted },
    geoLead: { backgroundColor: 'rgba(0,230,118,0.12)', borderColor: 'rgba(0,230,118,0.3)', borderWidth: 1, borderRadius: 11 },
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
      style={s.countryRow}
      onPress={() => {
        if (fromSearch && allowCountryOnly) pickCountry(code);
        else { setCountry(code); setQuery(''); }
      }}
      activeOpacity={0.7}
      testID={`loc-country-${code}`}
    >
      <View style={s.countryLead}><CountryFlag code={code} width={26} /></View>
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

  // Полный каталог с SVG-флагами не монтируется одновременно: на Xiaomi
  // его удаление при первом символе занимало 756 мс ещё до поиска.
  const listRows = useMemo(() => {
    const rows = [];
    const point = (prefix, p, index, showHeart = true) => rows.push({ key: `${prefix}:${pointKey(p)}:${index}`, type: 'point', p, showHeart });
    const section = (key, icon, label) => rows.push({ key, type: 'section', icon, label });
    if (hits) {
      if (searchPending) rows.push({ key: 'loading', type: 'loading' });
      else {
        if (hits.countryHits.length === 0 && hits.pointHits.length === 0) rows.push({ key: 'empty', type: 'empty' });
        hits.countryHits.forEach(code => rows.push({ key: `hit-country:${code}`, type: 'country', code, fromSearch: true }));
        hits.pointHits.forEach((p, index) => point('hit', p, index));
        if (query.trim().length >= 2 && hits.countryHits.length === 0 && hits.pointHits.length === 0) {
          rows.push({ key: 'custom-divider', type: 'divider' });
          point('custom', customCityForCountry(query, country), 0, false);
        }
      }
    } else if (country) {
      rows.push({ key: 'country-back', type: 'countryBack' }, { key: 'country-divider', type: 'divider' });
      if (allowCountryOnly) rows.push({ key: 'country-only', type: 'countryOnly' }, { key: 'country-only-divider', type: 'divider' });
      countryPoints.forEach((p, index) => point('cc', p, index));
      rows.push({ key: 'country-hint', type: 'hint' }, { key: 'attribution', type: 'attribution' });
    } else {
      if (showGeo && !GPS_TRACKING_PAUSED) rows.push({ key: 'geo', type: 'geo' });
      if (scope === 'all' || scope === 'country') {
        section('countries', 'globe', 'loc_countries');
        COUNTRY_ORDER.forEach(code => rows.push({ key: `country:${code}`, type: 'country', code }));
      }
      if (scope === 'all' || scope === 'border') {
        section('borders', 'flag', 'loc_borders');
        BORDERS.forEach((p, index) => point('border', p, index, false));
      }
      if (scope === 'all' || scope === 'city') {
        if (favs.length) { section('favorites', 'star', 'loc_favorites'); favs.forEach((p, index) => point('fav', p, index)); }
        if (recent.length) { section('recent', 'clock', 'loc_recent'); recent.forEach((p, index) => point('recent', p, index)); }
        section('popular', 'star', 'route_popular');
        POPULAR.forEach((p, index) => point('popular', p, index));
      }
    }
    return rows;
  }, [hits, searchPending, query, country, countryPoints, allowCountryOnly, showGeo, scope, favs, recent]);

  const renderListRow = ({ item }) => {
    switch (item.type) {
      case 'point': return <Row p={item.p} showHeart={item.showHeart} />;
      case 'country': return <CountryRow code={item.code} fromSearch={item.fromSearch} />;
      case 'section': return <Sect icon={item.icon}>{t(item.label)}</Sect>;
      case 'loading': return <ActivityIndicator color={v1.driver} testID="loc-search-loading" />;
      case 'empty': return <Text style={s.empty}>{t('loc_no_results')}</Text>;
      case 'divider': return <View style={s.divider} />;
      case 'hint': return <Text style={s.empty}>{t('loc_search_ph')} · {t('loc_custom_hint')}</Text>;
      case 'attribution': return <Text style={[s.sub, { paddingHorizontal: 16 }]}>GeoNames · CC BY 4.0</Text>;
      case 'countryBack': return <TouchableOpacity style={s.row} onPress={() => setCountry(null)} activeOpacity={0.7} testID="loc-country-back">
        <View style={s.lead}><Text style={s.leadText}>‹</Text></View><View style={{ flex: 1 }}>
          <Text style={s.name}>{t('loc_all_countries')}</Text><Text style={s.sub} numberOfLines={1}>{countryLabel(country)}</Text>
        </View></TouchableOpacity>;
      case 'countryOnly': return <TouchableOpacity style={s.row} onPress={() => pickCountry(country)} activeOpacity={0.7} testID={`loc-country-only-${country}`}>
        <View style={[s.lead, s.geoLead]}><Feather name="globe" size={18} color={v1.driver} /></View>
        <View style={{ flex: 1 }}><Text style={[s.name, { color: v1.driver }]}>{t('loc_whole_country')}</Text>
          <Text style={s.sub} numberOfLines={1}>{countryLabel(country)}</Text></View><Text style={s.chev}>›</Text>
      </TouchableOpacity>;
      case 'geo': return <TouchableOpacity style={s.row} onPress={useGeo} testID="loc-geo" activeOpacity={0.7}>
        <View style={[s.lead, s.geoLead]}>{geoLoading ? <ActivityIndicator color={v1.driver} /> : <Feather name="map-pin" size={18} color={v1.driver} />}</View>
        <View style={{ flex: 1 }}><Text style={[s.name, { color: v1.driver }]}>{t('loc_geo')}</Text><Text style={s.sub}>{t('loc_geo_sub')}</Text></View>
        <Text style={s.chev}>›</Text></TouchableOpacity>;
      default: return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      {/* React Native Modal с presentationStyle="fullScreen" рендерится в
          отдельной native-иерархии, safe-area контекст из App root не
          наследуется — из-за этого на iPhone с dynamic island кнопка «Назад»
          в header'е слипалась с временем в статус-баре (жалоба владельца
          28.07, скрин IMG_6789). Свой SafeAreaProvider внутри модалки
          восстанавливает реальные insets, и edges=['top'] снова работает. */}
      {visible ? <SafeAreaProvider>
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
              onChangeText={handleQueryChange}
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

        <FlatList
          testID="loc-results"
          data={listRows}
          keyExtractor={item => item.key}
          renderItem={renderListRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          initialNumToRender={8}
          maxToRenderPerBatch={4}
          windowSize={3}
        />
      </SafeAreaView>
      </SafeAreaProvider> : null}
    </Modal>
  );
}
