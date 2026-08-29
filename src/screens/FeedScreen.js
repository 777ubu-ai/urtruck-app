import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth, LEVELS } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { normalizeTrip, tripDisplay } from '../utils/normalizers';
import { localizePlace } from '../utils/places';
import { useToast } from '../components/Toast';
import { useVerificationGate } from '../components/VerificationGate';
import { SkeletonCard } from '../components/Skeleton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import DatePicker from '../components/DatePicker';
import LocationPickerModal from '../components/LocationPickerModal';
import { TRUCK_KEYS } from '../utils/truckConstants';
import { COUNTRIES as GEO_COUNTRIES } from '../utils/geography';

const ACCENT = '#34936B';
const ACCENT_SOFT = '#EAF5EF';

const COPY = {
  RU: {
    favorites: 'Избранное', empty: 'Подходящих машин пока нет', loadError: 'Не удалось загрузить машины',
    retry: 'Повторить', perTrip: 'за рейс', date: 'Выезд',
  },
  EN: {
    favorites: 'Saved', empty: 'No matching trucks yet', loadError: 'Could not load trucks',
    retry: 'Retry', perTrip: 'per trip', date: 'Departure',
  },
  ZH: {
    favorites: '收藏', empty: '暂时没有合适的车辆', loadError: '无法加载车辆',
    retry: '重试', perTrip: '每趟', date: '出发',
  },
  KK: {
    favorites: 'Таңдаулы', empty: 'Сәйкес көлік әзірге жоқ', loadError: 'Көліктерді жүктеу мүмкін болмады',
    retry: 'Қайталау', perTrip: 'рейске', date: 'Шығу',
  },
};

const toIso = (value) => {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : '';
};

const feedPalette = (theme, isDark) => ({
  pageBg: theme.bg,
  surface: theme.card || theme.surface,
  text: theme.text,
  textSecondary: theme.textSecondary,
  textMuted: theme.textMuted,
  border: theme.border,
  shadow: isDark ? '#000000' : '#14211C',
  accent: ACCENT,
  accentSoft: isDark ? 'rgba(22,135,89,0.18)' : ACCENT_SOFT,
  filterActive: isDark ? 'rgba(22,135,89,0.16)' : '#FAFDFC',
  favoriteBg: isDark ? 'rgba(22,135,89,0.12)' : '#F5FBF8',
});

function TripCard({ item, lang, t, copy, saved, onToggleSaved, onPress, colors }) {
  const display = tripDisplay(item, t, lang);
  const notSpecified = t('not_specified');
  const specs = [display.truckType, display.availableM3, display.capacityTons]
    .filter((value) => value && value !== notSpecified)
    .join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.surface, shadowColor: colors.shadow },
      ]}
      testID={`trip-card-${item.id}`}
      accessibilityRole="button"
    >
      <View style={styles.cardBody}>
        <Text style={[styles.route, { color: colors.text }]} numberOfLines={2}>
          {display.from} → {display.to}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {[item.departure ? `${copy.date}: ${display.departure}` : null, specs || null].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.priceWrap}>
        <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>{display.price}</Text>
        <Text style={[styles.perTrip, { color: colors.textMuted }]}>{copy.perTrip}</Text>
      </View>

      <Pressable
        onPress={(event) => { event?.stopPropagation?.(); onToggleSaved(); }}
        hitSlop={10}
        style={[styles.bookmarkBtn, { backgroundColor: colors.favoriteBg }, saved && { backgroundColor: colors.accentSoft }]}
        testID={`trip-card-bookmark-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove saved trip' : 'Save trip'}
        accessibilityState={{ selected: saved }}
      >
        {saved ? (
          <FontAwesome5 name="bookmark" size={18} color={colors.accent} solid />
        ) : (
          <Feather name="bookmark" size={20} color={colors.accent} />
        )}
      </Pressable>
    </TouchableOpacity>
  );
}

export default function FeedScreen({ navigation }) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const colors = useMemo(() => feedPalette(theme, isDark), [theme, isDark]);
  const { session } = useAuth();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const myUserId = session?.user?.id;
  const role = 'client';
  const copy = COPY[lang] || COPY.RU;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [pageLimit, setPageLimit] = useState(50);
  const [dirFrom, setDirFrom] = useState('');
  const [dirTo, setDirTo] = useState('');
  const [dirFromCountry, setDirFromCountry] = useState('');
  const [dirToCountry, setDirToCountry] = useState('');
  const [showDirFromPicker, setShowDirFromPicker] = useState(false);
  const [showDirToPicker, setShowDirToPicker] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [filterType, setFilterType] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const savedBusyRef = React.useRef(new Set());

  const countryLabel = (code) => {
    if (!code) return '';
    const translated = t(`country_${code}`);
    return translated && translated !== `country_${code}` ? translated : (GEO_COUNTRIES[code]?.name || code);
  };

  const routeValue = (city, countryCode, placeholder) => {
    if (city) return localizePlace(city, lang);
    if (countryCode) return `${GEO_COUNTRIES[countryCode]?.flag || ''} ${countryLabel(countryCode)}`.trim();
    return placeholder;
  };

  const selectDirFrom = (value, point) => {
    setDirFrom(point?.countryOnly ? '' : ((point && point.name) || value || ''));
    setDirFromCountry(point?.country && point.country !== 'XX' ? point.country : '');
  };

  const selectDirTo = (value, point) => {
    setDirTo(point?.countryOnly ? '' : ((point && point.name) || value || ''));
    setDirToCountry(point?.country && point.country !== 'XX' ? point.country : '');
  };

  const loadSaved = useCallback(async () => {
    if (!myUserId) {
      setSavedIds(new Set());
      setSavedOnly(false);
      return;
    }
    const result = await marketAPI.favList('trip').catch(() => null);
    if (Array.isArray(result?.favorites)) {
      setSavedIds(new Set(result.favorites.map((favorite) => String(favorite.item_id))));
    }
  }, [myUserId]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const result = await marketAPI.listTrips({
        fromCity: dirFrom.trim() || '',
        toCity: dirTo.trim() || '',
        truckType: filterType || '',
        limit: pageLimit,
      });
      if (result?.serverError) throw new Error('trip_feed_failed');
      const mapped = (result?.trips || [])
        .filter((trip) => !myUserId || trip.driver_id !== myUserId)
        .map((raw) => {
          const trip = normalizeTrip({ ...raw, _server: true });
          if (!trip) return null;
          return {
            ...trip,
            fromCountry: String(raw.from_country || '').trim().toUpperCase(),
            toCountry: String(raw.to_country || '').trim().toUpperCase(),
          };
        })
        .filter((trip) => trip?.id && trip.from && trip.to);
      setItems(mapped);
    } catch (e) {
      console.warn('[FeedScreen] load trips failed:', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dirFrom, dirTo, filterType, pageLimit, myUserId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  useFocusEffect(useCallback(() => {
    load();
    loadSaved();
  }, [load, loadSaved]));

  const visibleItems = useMemo(() => {
    const dateStart = toIso(dateFrom);
    const dateEnd = toIso(dateTo);
    let data = items.filter((item) => {
      const departure = toIso(item.departure);
      if (dateStart && departure && departure < dateStart) return false;
      if (dateEnd && departure && departure > dateEnd) return false;
      if (dirFromCountry) {
        const fromCountry = String(item.fromCountry || '').toUpperCase();
        if (fromCountry !== dirFromCountry) return false;
      }
      if (dirToCountry) {
        const toCountry = String(item.toCountry || '').toUpperCase();
        if (toCountry !== dirToCountry) return false;
      }
      if (savedOnly && !savedIds.has(String(item.id))) return false;
      return true;
    });
    if (sortBy === 'price-asc') data = [...data].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sortBy === 'price-desc') data = [...data].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    if (sortBy === 'newest') data = [...data].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return data;
  }, [items, dateFrom, dateTo, dirFromCountry, dirToCountry, sortBy, savedOnly, savedIds]);

  const openTrip = async (item) => {
    const ok = await requireLevel(LEVELS.PHONE, 'open_detail', 'client');
    if (!ok) return;
    navigation.navigate('TripDetail', { trip: item, tripId: item.id, role });
  };

  const toggleSaved = async (item) => {
    const ok = myUserId || await requireLevel(LEVELS.PHONE, 'favorite_trip', 'client');
    if (!ok) return;
    const id = String(item.id);
    if (savedBusyRef.current.has(id)) return;
    savedBusyRef.current.add(id);
    const had = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (had) next.delete(id); else next.add(id);
      return next;
    });
    try {
      const result = had
        ? await marketAPI.favRemove('trip', id)
        : await marketAPI.favAdd('trip', id, {
            from: item.from,
            to: item.to,
            departure: item.departure,
            truck_type: item.truckType,
            capacity_tons: item.capacityTons,
            available_m3: item.availableM3,
            price: item.price,
            currency: item.currency,
            driver_id: item.driverId,
            driver_name: item.driverName,
          });
      if (!result || result.ok !== true) throw new Error('favorite_failed');
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (had) next.add(id); else next.delete(id);
        return next;
      });
      toast(t('send_error'), 'error');
    } finally {
      savedBusyRef.current.delete(id);
    }
  };

  const toggleSavedOnly = async () => {
    if (!myUserId) {
      const ok = await requireLevel(LEVELS.PHONE, 'favorite_trip', 'client');
      if (!ok) return;
    }
    setSavedOnly((value) => !value);
  };

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    Promise.allSettled([load(), loadSaved()]).finally(() => setRefreshing(false));
  };

  const filterPill = (key, label, icon, active) => (
    <TouchableOpacity
      key={key}
      style={[
        styles.filterPill,
        {
          borderColor: active ? '#BFDCCF' : colors.border,
          backgroundColor: active ? colors.filterActive : colors.surface,
          shadowColor: colors.shadow,
        },
      ]}
      onPress={() => setActiveFilter(key)}
      testID={`trip-filter-${key}`}
      accessibilityRole="button"
    >
      <Feather name={icon} size={16} color={active ? ACCENT : colors.textSecondary} />
      <Text style={[styles.filterPillText, { color: active ? ACCENT : colors.textSecondary }]}>{label}</Text>
      <Feather name="chevron-down" size={15} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const feedControls = (
    <View style={styles.feedControls} testID="trip-feed-controls">
      <View
        style={[
          styles.routeSelector,
          {
            borderColor: (dirFrom || dirTo || dirFromCountry || dirToCountry) ? colors.accent : colors.border,
            backgroundColor: colors.surface,
            shadowColor: colors.shadow,
          },
        ]}
        testID="feed-route-selector"
      >
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirFromPicker(true)} testID="feed-route-from">
          <View style={styles.routeLabelRow}>
            <Feather name="map-pin" size={14} color={colors.textMuted} />
            <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>{t('from')}</Text>
          </View>
          <Text style={[styles.routeValue, { color: (dirFrom || dirFromCountry) ? colors.text : colors.textMuted }]} numberOfLines={1}>
            {routeValue(dirFrom, dirFromCountry, t('create_field_from_placeholder'))}
          </Text>
        </TouchableOpacity>
        <Feather name="arrow-right" size={24} color={ACCENT} />
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirToPicker(true)} testID="feed-route-to">
          <View style={styles.routeLabelRow}>
            <Feather name="flag" size={14} color={colors.textMuted} />
            <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>{t('to')}</Text>
          </View>
          <Text style={[styles.routeValue, { color: (dirTo || dirToCountry) ? colors.text : colors.textMuted }]} numberOfLines={1}>
            {routeValue(dirTo, dirToCountry, t('create_field_to_placeholder'))}
          </Text>
        </TouchableOpacity>
        {(dirFrom || dirTo || dirFromCountry || dirToCountry) ? (
          <TouchableOpacity
            onPress={() => { setDirFrom(''); setDirTo(''); setDirFromCountry(''); setDirToCountry(''); }}
            hitSlop={10}
            testID="feed-route-clear"
          >
            <Feather name="x" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filters}>
        {filterPill('date', t('filter_date'), 'calendar', !!(dateFrom || dateTo))}
        {filterPill('body', t('filter_body'), 'truck', !!filterType)}
        {filterPill('price', t('filter_price'), 'dollar-sign', sortBy !== 'newest')}
        <TouchableOpacity
          style={[
            styles.filterPill,
            {
              borderColor: savedOnly ? '#A6D2BE' : '#CAE2D7',
              backgroundColor: savedOnly ? colors.accentSoft : colors.favoriteBg,
              shadowColor: colors.shadow,
            },
          ]}
          onPress={toggleSavedOnly}
          testID="trip-filter-favorites"
          accessibilityRole="button"
          accessibilityState={{ selected: savedOnly }}
        >
          <Feather name="bookmark" size={17} color={colors.accent} />
          <Text style={[styles.filterPillText, { color: colors.accent }]}>{copy.favorites}</Text>
          {savedIds.size > 0 ? <Text style={[styles.favoritesCount, { color: colors.textSecondary }]}>{savedIds.size}</Text> : null}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.pageBg }]} edges={['top']} testID="trip-feed-screen">
      <View style={[styles.topBar, { backgroundColor: colors.pageBg }]} testID="trip-feed-minimal-header">
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile', { role })}
          style={styles.menuBtn}
          hitSlop={8}
          testID="feed-menu-btn"
          accessibilityLabel={t('tab_profile')}
        >
          <Feather name="menu" size={27} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        style={[styles.list, { backgroundColor: colors.pageBg }]}
        data={loading ? [] : visibleItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TripCard
            item={item}
            lang={lang}
            t={t}
            copy={copy}
            saved={savedIds.has(String(item.id))}
            onToggleSaved={() => toggleSaved(item)}
            onPress={() => openTrip(item)}
            colors={colors}
          />
        )}
        ListHeaderComponent={feedControls}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loading && !savedOnly && items.length >= pageLimit) setPageLimit((p) => p + 50);
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <View style={styles.emptyWrap}>
              <Feather name={error ? 'alert-circle' : savedOnly ? 'bookmark' : 'truck'} size={32} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>{error ? copy.loadError : copy.empty}</Text>
              {error ? (
                <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.accentSoft }]} onPress={load} testID="trip-feed-retry">
                  <Text style={[styles.retryText, { color: colors.accent }]}>{copy.retry}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }
      />

      <LocationPickerModal
        visible={showDirFromPicker}
        onClose={() => setShowDirFromPicker(false)}
        title={t('loc_from_title')}
        showGeo
        allowCountryOnly
        onSelect={selectDirFrom}
      />
      <LocationPickerModal
        visible={showDirToPicker}
        onClose={() => setShowDirToPicker(false)}
        title={t('loc_to_title')}
        allowCountryOnly
        onSelect={selectDirTo}
      />

      <BottomSheet visible={activeFilter === 'date'} onClose={() => setActiveFilter(null)} title={t('filter_date')}>
        <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>{t('filter_date_from')}</Text>
        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={t('date_placeholder')} />
        <Text style={[styles.sheetLabel, { color: colors.textMuted, marginTop: 14 }]}>{t('filter_date_to')}</Text>
        <DatePicker value={dateTo} onChange={setDateTo} placeholder={t('date_placeholder')} />
        <View style={styles.sheetActions}>
          <TouchableOpacity style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => { setDateFrom(''); setDateTo(''); }}>
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeFilter === 'body'} onClose={() => setActiveFilter(null)} title={t('filter_body')}>
        <View style={styles.bodyGrid}>
          <TouchableOpacity
            style={[styles.bodyChip, { backgroundColor: colors.surface, borderColor: colors.border }, !filterType && styles.bodyChipActive]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[styles.bodyChipText, { color: colors.textSecondary }, !filterType && styles.bodyChipTextActive]}>{t('filter_all')}</Text>
          </TouchableOpacity>
          {TRUCK_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.bodyChip, { backgroundColor: colors.surface, borderColor: colors.border }, filterType === key && styles.bodyChipActive]}
              onPress={() => setFilterType(filterType === key ? null : key)}
            >
              <Text style={[styles.bodyChipText, { color: colors.textSecondary }, filterType === key && styles.bodyChipTextActive]}>{t(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sheetActions}>
          <TouchableOpacity style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setFilterType(null)}>
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeFilter === 'price'} onClose={() => setActiveFilter(null)} title={t('filter_price')}>
        {[
          ['newest', t('filter_newest')],
          ['price-asc', t('filter_price_asc')],
          ['price-desc', t('filter_price_desc')],
        ].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.sortRow, { backgroundColor: colors.surface, borderColor: colors.border }, sortBy === value && styles.sortRowActive]}
            onPress={() => setSortBy(value)}
          >
            <Text style={[styles.sortRowText, { color: colors.text }, sortBy === value && styles.sortRowTextActive]}>{label}</Text>
            {sortBy === value ? <Feather name="check" size={18} color={ACCENT} /> : null}
          </TouchableOpacity>
        ))}
        <View style={styles.sheetActions}>
          <TouchableOpacity style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setSortBy('newest')}>
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <Gate />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 50, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 20 },
  menuBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 120 },
  feedControls: { marginHorizontal: -16, paddingBottom: 8 },
  routeSelector: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1.5, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14, gap: 10,
    shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  routeHalf: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  routeLabel: { fontSize: 13, fontWeight: '700' },
  routeValue: { fontSize: 16, fontWeight: '800' },
  filtersScroll: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  filterPill: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: 24, paddingHorizontal: 15,
    shadowOpacity: 0.025, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  filterPillText: { fontSize: 15, fontWeight: '700' },
  favoritesCount: { fontSize: 13, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  card: {
    minHeight: 146, borderRadius: 22, borderWidth: 1, marginBottom: 14,
    paddingLeft: 20, paddingRight: 20, paddingVertical: 18,
    shadowOpacity: 0.035, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  cardBody: { paddingRight: 150 },
  route: { fontSize: 20, fontWeight: '800', letterSpacing: -0.35, lineHeight: 26 },
  meta: { fontSize: 14, fontWeight: '600', marginTop: 8, lineHeight: 20 },
  priceWrap: { position: 'absolute', right: 70, bottom: 25, alignItems: 'flex-end', maxWidth: 155 },
  price: { fontSize: 21, fontWeight: '900', letterSpacing: -0.35 },
  perTrip: { fontSize: 12, marginTop: 3 },
  bookmarkBtn: { position: 'absolute', right: 16, bottom: 17, width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { paddingTop: 8 },
  emptyWrap: { paddingVertical: 54, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retryBtn: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 14, fontWeight: '800' },
  sheetLabel: { fontSize: 12, fontWeight: '700', marginBottom: 7 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  sheetSecondary: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetSecondaryText: { fontSize: 14, fontWeight: '800' },
  sheetPrimary: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT },
  sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bodyChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  bodyChipActive: { borderColor: '#9CCDB7', backgroundColor: ACCENT_SOFT },
  bodyChipText: { fontSize: 13, fontWeight: '700' },
  bodyChipTextActive: { color: ACCENT },
  sortRow: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortRowActive: { borderColor: '#9CCDB7' },
  sortRowText: { fontSize: 14, fontWeight: '700' },
  sortRowTextActive: { color: ACCENT },
});
