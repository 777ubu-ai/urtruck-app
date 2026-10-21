import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
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
import RootHeader from '../components/ui/v1/RootHeader';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import MarketplaceCard from '../components/ui/v1/MarketplaceCard';
import CompactFilterChip from '../components/ui/v1/CompactFilterChip';
import CountryFlag from '../components/ui/v1/CountryFlag';
import { LIGHT as V1_LIGHT } from '../theme/designV1Palette';

// Canonical driver accent from the designV1 palette (identical value in
// DARK.driver) — no local hardcoded green.
const ACCENT = V1_LIGHT.driver;
const PAGE_BG = '#F7F9F7';
const SURFACE = '#FFFFFF';
const TEXT = '#17221E';
const TEXT_SECONDARY = '#606B66';
const TEXT_MUTED = '#808A85';
const BORDER = '#E5EAE7';

const COPY = {
  RU: {
    favorites: 'Избранное', empty: 'Подходящих машин пока нет', loadError: 'Не удалось загрузить машины',
    retry: 'Повторить', perTrip: 'за рейс', departure: 'Выезд', minPrice: 'Цена от', maxPrice: 'Цена до', priceScope: 'Сортировка и диапазон только в выбранной валюте', scrollToTop: 'Наверх', priceRangeError: 'Проверьте цены и даты: начало диапазона должно быть не позже конца',
  },
  EN: {
    favorites: 'Saved', empty: 'No matching trucks yet', loadError: 'Could not load trucks',
    retry: 'Retry', perTrip: 'per trip', departure: 'Departure', minPrice: 'Price from', maxPrice: 'Price to', priceScope: 'Sort and range use the selected currency only', scrollToTop: 'Back to top', priceRangeError: 'Check prices and dates: the range start must not be after its end',
  },
  ZH: {
    favorites: '收藏', empty: '暂时没有合适的车辆', loadError: '无法加载车辆',
    retry: '重试', perTrip: '每趟', departure: '出发', minPrice: '最低价', maxPrice: '最高价', priceScope: '排序和价格范围仅使用所选货币', scrollToTop: '回到顶部', priceRangeError: '请检查价格和日期：范围起始值不能晚于结束值',
  },
  KK: {
    favorites: 'Таңдаулы', empty: 'Сәйкес көлік әзірге жоқ', loadError: 'Көліктерді жүктеу мүмкін болмады',
    retry: 'Қайталау', perTrip: 'рейске', departure: 'Шығу', minPrice: 'Бағасы төмен', maxPrice: 'Бағасы жоғары', priceScope: 'Сұрыптау мен аралық таңдалған валютада ғана', scrollToTop: 'Жоғарыға', priceRangeError: 'Баға мен күндерді тексеріңіз: аралықтың басы соңынан кеш болмауы керек',
  },
};

const toIso = (value) => {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  return match
    ? `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
    : '';
};

const feedPalette = (theme, isDark) => ({
  pageBg: theme.bg || PAGE_BG,
  surface: theme.card || theme.surface || SURFACE,
  text: theme.text || TEXT,
  textSecondary: theme.textSecondary || TEXT_SECONDARY,
  textMuted: theme.textMuted || TEXT_MUTED,
  border: theme.border || BORDER,
  shadow: isDark ? '#000000' : '#14211C',
  // Canonical driver accent: no local hardcoded green. cardActiveBorder is
  // #168759 in both themes; cardActive is the theme-aware soft surface
  // (#E8F6EF light / #203329 dark) for active chips and favorites.
  accent: theme.cardActiveBorder || '#168759',
  accentSoft: theme.cardActive || '#E8F6EF',
  filterActive: isDark ? (theme.surfaceAlt || theme.card || theme.surface || SURFACE) : '#FAFDFC',
  favoriteBg: isDark ? (theme.surfaceAlt || theme.card || theme.surface || SURFACE) : '#F5FBF8',
});

// TripCard — canonical MarketplaceCard (Design v1 Commit 3). Flags are
// rendered from item.fromCountry/toCountry by the shared component; the
// screen only maps data to display strings.
function TripCard({ item, lang, t, copy, saved, onToggleSaved, onPress }) {
  const display = tripDisplay(item, t, lang);
  const notSpecified = t('not_specified');
  const specs = [display.truckType, display.availableM3, display.capacityTons]
    .filter((value) => value && value !== notSpecified)
    .join(' · ');

  return (
    <MarketplaceCard
      testID={`trip-card-${item.id}`}
      onPress={onPress}
      style={styles.cardSpacing}
      route={{
        from: display.from,
        to: display.to,
        fromFlag: item.fromCountry || null,
        toFlag: item.toCountry || null,
        numberOfLines: 1,
      }}
      price={display.price}
      priceMeta={copy.perTrip}
      meta={[[item.departure ? `${copy.departure}: ${display.departure}` : null, specs || null].filter(Boolean).join(' · ')]}
      description={display.driverName !== notSpecified ? display.driverName : null}
      bookmark={{
        saved,
        onToggle: onToggleSaved,
        testID: `trip-card-bookmark-${item.id}`,
        accessibilityLabel: saved ? t('in_favorites') : t('add_to_favorites'),
      }}
    />
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
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = React.useRef({ busy: false, nextOffset: null, failed: false });
  const loadSeqRef = React.useRef(0);
  useEffect(() => () => { loadSeqRef.current++; }, []);
  const [errorAppend, setErrorAppend] = useState(false);
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
  const [priceCurrency, setPriceCurrency] = useState('USD');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [filterDraft, setFilterDraft] = useState(null);
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const savedBusyRef = React.useRef(new Set());
  const listRef = React.useRef(null);
  const scrollOffsetRef = React.useRef(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const countryLabel = (code) => {
    if (!code) return '';
    const translated = t(`country_${code}`);
    return translated && translated !== `country_${code}`
      ? translated
      : (GEO_COUNTRIES[code]?.name || code);
  };

  // Track: Claude harness fix, feed placeholder truncation. Callers used to
  // pass t('create_field_from_placeholder')/t('create_field_to_placeholder')
  // here ('Например, Алматы' / 'Например, Москва') — that text is sized for
  // CreateTripScreen.js's full-width input, not this filter's ~50%-width
  // routeHalf column with numberOfLines={1}; it visibly clipped to
  // "Например, Алм…" / "Например, Мос…" (the routeLabel row right above
  // already says "Откуда"/"Куда", so an "example city" hint is redundant
  // here anyway). Callers now pass t('city') instead — short, fits the
  // column, and reads naturally under the From/To label without repeating
  // it. The two create_field_*_placeholder keys are unchanged (still used
  // by the real forms) — this only changes what filter callers pass in.
  const routeValue = (city, countryCode, placeholder) => {
    if (city) return localizePlace(city, lang);
    if (countryCode) return countryLabel(countryCode);
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

  const load = useCallback(async ({ append = false, retry = false } = {}) => {
    const previous = pageRef.current;
    if (append && (previous.busy || (previous.failed && !retry) || previous.nextOffset == null)) return;
    const requestId = ++loadSeqRef.current;
    const offset = append ? previous.nextOffset : 0;
    pageRef.current = { busy: true, nextOffset: append ? previous.nextOffset : null, failed: false };
    if (append) setLoadingMore(true);
    else {
      scrollOffsetRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    setError(false);
    setErrorAppend(false);
    try {
      const result = await marketAPI.listTrips({
        fromCity: dirFrom.trim() || '',
        toCity: dirTo.trim() || '',
        fromCountry: dirFromCountry,
        toCountry: dirToCountry,
        truckType: filterType || '',
        dateFrom: toIso(dateFrom),
        dateTo: toIso(dateTo),
        minPrice: minPrice.trim() ? Number(minPrice) : null,
        maxPrice: maxPrice.trim() ? Number(maxPrice) : null,
        currency: (sortBy !== 'newest' || minPrice.trim() || maxPrice.trim()) ? priceCurrency : '',
        sortBy,
        savedOnly,
        limit: 50,
        offset,
      });
      if (requestId !== loadSeqRef.current) return;
      if (result?.unsupportedSearchContract) throw new Error('search_contract_unavailable');
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
      if (typeof result?.has_more !== 'boolean') throw new Error('invalid_page');
      const next = result.has_more ? result.next_offset : null;
      if (result.has_more && !(Number.isInteger(next) && next > offset)) throw new Error('invalid_page');
      setItems(current => append
        ? [...new Map([...current, ...mapped].map(item => [item.id, item])).values()]
        : mapped);
      pageRef.current = { busy: false, nextOffset: next, failed: false };
    } catch (err) {
      if (requestId !== loadSeqRef.current) return;
      console.warn('[FeedScreen] load trips failed:', err);
      pageRef.current.failed = true;
      setErrorAppend(append);
      setError(true);
    } finally {
      if (requestId === loadSeqRef.current) {
        pageRef.current.busy = false;
        setLoadingMore(false);
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dirFrom, dirTo, dirFromCountry, dirToCountry, filterType, myUserId, dateFrom, dateTo, minPrice, maxPrice, priceCurrency, sortBy, savedOnly]);

  const loadNextPage = useCallback(() => {
    const page = pageRef.current;
    if (!page.busy && !page.failed && page.nextOffset != null) load({ append: true });
  }, [load]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  useFocusEffect(useCallback(() => {
    // Keep the loaded server pages and FlatList anchor when returning from a
    // detail screen. Pull-to-refresh remains the explicit fresh-query action.
    loadSaved();
    const frame = requestAnimationFrame(() => {
      if (scrollOffsetRef.current > 0) listRef.current?.scrollToOffset({ offset: scrollOffsetRef.current, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [loadSaved]));

  // The server applies all filters and sorting before LIMIT/OFFSET. Sorting a
  // partially loaded JS array made the apparent cheapest/newest page false.
  const visibleItems = items;

  const openTrip = async (item) => {
    const ok = await requireLevel(LEVELS.PHONE, 'open_detail', 'client');
    if (!ok) return;
    navigation.navigate('TripDetail', { trip: item, tripId: item.id, role });
  };

  const toggleSaved = async (item) => {
    if (!myUserId) {
      const ok = await requireLevel(LEVELS.PHONE, 'favorite_trip', 'client');
      if (!ok) return;
    }

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
            from_country: item.fromCountry || '',
            to_country: item.toCountry || '',
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

  const openFilter = (key) => {
    setFilterDraft({ dateFrom, dateTo, sortBy, priceCurrency, minPrice, maxPrice });
    setActiveFilter(key);
  };

  const applyFilterDraft = () => {
    if (!filterDraft) { setActiveFilter(null); return; }
    const parsePrice = (raw) => raw.trim() ? Number(raw.trim().replace(',', '.')) : null;
    const min = parsePrice(filterDraft.minPrice);
    const max = parsePrice(filterDraft.maxPrice);
    const startDate = toIso(filterDraft.dateFrom);
    const endDate = toIso(filterDraft.dateTo);
    if ((min != null && (!Number.isFinite(min) || min < 0))
      || (max != null && (!Number.isFinite(max) || max < 0))
      || (min != null && max != null && min > max)
      || (startDate && endDate && startDate > endDate)) {
      toast(copy.priceRangeError, 'error');
      return;
    }
    if (min != null) setMinPrice(String(min));
    if (max != null) setMaxPrice(String(max));
    setDateFrom(filterDraft.dateFrom);
    setDateTo(filterDraft.dateTo);
    setSortBy(filterDraft.sortBy);
    setPriceCurrency(filterDraft.priceCurrency);
    setMinPrice(filterDraft.minPrice);
    setMaxPrice(filterDraft.maxPrice);
    setFilterDraft(null);
    setActiveFilter(null);
  };

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    Promise.allSettled([load(), loadSaved()]).finally(() => setRefreshing(false));
  };

  const filterPill = (key, label, icon, active) => (
    <CompactFilterChip key={key} icon={icon} label={label} active={active} onPress={() => openFilter(key)} testID={`trip-filter-${key}`} />
  );

  const clearAllFilters = () => {
    setDirFrom(''); setDirTo(''); setDirFromCountry(''); setDirToCountry('');
    setFilterType(null); setDateFrom(''); setDateTo(''); setSortBy('newest');
    setMinPrice(''); setMaxPrice(''); setSavedOnly(false);
  };
  const hasAnyFilter = !!(dirFrom || dirTo || dirFromCountry || dirToCountry || filterType || dateFrom || dateTo || sortBy !== 'newest' || minPrice || maxPrice || savedOnly);

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

        <TouchableOpacity
          style={styles.routeHalf}
          onPress={() => setShowDirFromPicker(true)}
          testID="feed-route-from"
        >
          <View style={styles.routeLabelRow}>
            <Feather name="map-pin" size={14} color={colors.textMuted} />
            <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>{t('from')}</Text>
          </View>
          <View style={styles.routeValueRow}>
            {dirFromCountry ? <CountryFlag code={dirFromCountry} width={20} /> : null}
            <Text
              style={[styles.routeValue, { color: (dirFrom || dirFromCountry) ? colors.text : colors.textMuted, flex: 1 }]}
              numberOfLines={1}
            >
              {routeValue(dirFrom, dirFromCountry, t('city'))}
            </Text>
          </View>
        </TouchableOpacity>

        <Feather name="arrow-right" size={24} color={ACCENT} />

        <TouchableOpacity
          style={styles.routeHalf}
          onPress={() => setShowDirToPicker(true)}
          testID="feed-route-to"
        >
          <View style={styles.routeLabelRow}>
            <Feather name="flag" size={14} color={colors.textMuted} />
            <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>{t('to')}</Text>
          </View>
          <View style={styles.routeValueRow}>
            {dirToCountry ? <CountryFlag code={dirToCountry} width={20} /> : null}
            <Text
              style={[styles.routeValue, { color: (dirTo || dirToCountry) ? colors.text : colors.textMuted, flex: 1 }]}
              numberOfLines={1}
            >
              {routeValue(dirTo, dirToCountry, t('city'))}
            </Text>
          </View>
        </TouchableOpacity>

        {(dirFrom || dirTo || dirFromCountry || dirToCountry) ? (
          <TouchableOpacity
            onPress={() => {
              setDirFrom('');
              setDirTo('');
              setDirFromCountry('');
              setDirToCountry('');
            }}
            hitSlop={10}
            testID="feed-route-clear"
          >
            <Feather name="x" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filters}
      >
        {filterPill('date', t('filter_date'), 'calendar', !!(dateFrom || dateTo))}
        {filterPill('body', t('filter_body'), 'truck', !!filterType)}
        {filterPill('price', t('filter_price'), 'dollar-sign', sortBy !== 'newest' || !!minPrice || !!maxPrice)}
        <CompactFilterChip icon="bookmark" active={savedOnly} onPress={toggleSavedOnly} testID="trip-filter-favorites" accessibilityLabel={copy.favorites} />
        {hasAnyFilter ? <CompactFilterChip icon="x-circle" label={t('filter_reset')} onPress={clearAllFilters} testID="trip-filter-reset" /> : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.pageBg }]}
      edges={['top']}
      testID="trip-feed-screen"
    >
      <RootHeader externalFeedEntry navigation={navigation} role={role} testID="trip-feed-minimal-header" menuTestID="feed-menu-btn" />

      <FlatList
        ref={listRef}
        style={[styles.list, { backgroundColor: colors.pageBg }]}
        data={loading ? [] : visibleItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TripCard
            item={item}
            lang={lang}
            t={t}
            copy={copy}
            saved={savedOnly || savedIds.has(String(item.id))}
            onToggleSaved={() => toggleSaved(item)}
            onPress={() => openTrip(item)}
          />
        )}
        ListHeaderComponent={feedControls}
        ListHeaderComponentStyle={{ backgroundColor: colors.pageBg }}
        stickyHeaderIndices={[0]}
        onScroll={(event) => {
          const offset = event.nativeEvent.contentOffset.y;
          scrollOffsetRef.current = offset;
          const visible = offset > 800;
          setShowScrollTop((current) => current === visible ? current : visible);
          const { height: contentHeight } = event.nativeEvent.contentSize || {};
          const { height: viewportHeight } = event.nativeEvent.layoutMeasurement || {};
          if (Number.isFinite(contentHeight) && Number.isFinite(viewportHeight)
            && contentHeight - viewportHeight - offset <= viewportHeight * 0.5) loadNextPage();
        }}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.5}
        scrollEventThrottle={100}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        )}
        ListFooterComponent={loadingMore ? (
          <View style={styles.pageFooter} testID="trip-feed-loading-more">
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : error && items.length > 0 ? (
          <View style={styles.pageFooter}>
            <Text style={styles.emptyTitle}>{copy.loadError}</Text>
            <TouchableOpacity
              testID="trip-feed-retry-more"
              style={[styles.retryBtn, { backgroundColor: colors.accentSoft }]}
              onPress={() => errorAppend ? load({ append: true, retry: true }) : load()}
            >
              <Text style={[styles.retryText, { color: colors.accent }]}>{copy.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        ListEmptyComponent={loading ? (
          <View style={styles.loadingWrap}>
            {[0, 1, 2, 3].map((index) => <SkeletonCard key={index} />)}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Feather
              name={error ? 'alert-circle' : savedOnly ? 'bookmark' : 'truck'}
              size={32}
              color={colors.textMuted}
            />
            <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
              {error ? copy.loadError : copy.empty}
            </Text>
            {error ? (
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.accentSoft }]}
                onPress={load}
                testID="trip-feed-retry"
              >
                <Text style={[styles.retryText, { color: colors.accent }]}>{copy.retry}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />
      {showScrollTop ? (
        <TouchableOpacity testID="trip-feed-scroll-top" accessibilityLabel={copy.scrollToTop} style={[styles.scrollTopButton, { backgroundColor: colors.accent }]} onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}>
          <Feather name="arrow-up" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}

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

      <BottomSheet
        visible={activeFilter === 'date'}
        onClose={() => setActiveFilter(null)}
        title={t('filter_date')}
        testID="filter-date-sheet"
      >
        <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>{t('filter_date_from')}</Text>
        <DatePicker value={filterDraft?.dateFrom ?? dateFrom} onChange={(value) => setFilterDraft((current) => ({ ...current, dateFrom: value }))} placeholder={t('date_placeholder')} />
        <Text style={[styles.sheetLabel, { color: colors.textMuted, marginTop: 14 }]}>{t('filter_date_to')}</Text>
        <DatePicker value={filterDraft?.dateTo ?? dateTo} onChange={(value) => setFilterDraft((current) => ({ ...current, dateTo: value }))} placeholder={t('date_placeholder')} />
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setFilterDraft((current) => ({ ...current, dateFrom: '', dateTo: '' }))}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="filter-sheet-apply" style={styles.sheetPrimary} onPress={applyFilterDraft}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={activeFilter === 'body'}
        onClose={() => setActiveFilter(null)}
        title={t('filter_body')}
        testID="filter-body-sheet"
      >
        <View style={styles.bodyGrid}>
          <TouchableOpacity
            style={[
              styles.bodyChip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              !filterType && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}
            onPress={() => setFilterType(null)}
          >
            <Text
              style={[
                styles.bodyChipText,
                { color: colors.textSecondary },
                !filterType && styles.bodyChipTextActive,
              ]}
            >
              {t('filter_all')}
            </Text>
          </TouchableOpacity>
          {TRUCK_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.bodyChip,
                { backgroundColor: colors.surface, borderColor: colors.border },
                filterType === key && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
              ]}
              onPress={() => setFilterType(filterType === key ? null : key)}
            >
              <Text
                style={[
                  styles.bodyChipText,
                  { color: colors.textSecondary },
                  filterType === key && styles.bodyChipTextActive,
                ]}
              >
                {t(key)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="filter-sheet-apply" style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={activeFilter === 'price'}
        onClose={() => setActiveFilter(null)}
        title={t('filter_price')}
        testID="filter-price-sheet"
      >
        {[
          ['newest', t('filter_newest')],
          ['price-asc', t('filter_price_asc')],
          ['price-desc', t('filter_price_desc')],
        ].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.sortRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
              (filterDraft?.sortBy ?? sortBy) === value && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}
            onPress={() => setFilterDraft((current) => ({ ...current, sortBy: value }))}
          >
            <Text
              style={[
                styles.sortRowText,
                { color: colors.textSecondary },
                (filterDraft?.sortBy ?? sortBy) === value && styles.sortRowTextActive,
              ]}
            >
              {label}
            </Text>
            {(filterDraft?.sortBy ?? sortBy) === value ? <Feather name="check" size={18} color={ACCENT} /> : null}
          </TouchableOpacity>
        ))}
        <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>{t('currency_label')}</Text>
        <View style={styles.currencyOptions}>
          {['USD', 'KZT', 'RUB', 'CNY'].map((code) => (
            <TouchableOpacity key={code} testID={`trip-price-currency-${code}`} style={[styles.currencyChip, (filterDraft?.priceCurrency ?? priceCurrency) === code && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]} onPress={() => setFilterDraft((current) => ({ ...current, priceCurrency: code }))}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{code}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.priceInputs}>
          <TextInput testID="trip-price-min" value={filterDraft?.minPrice ?? minPrice} onChangeText={(value) => setFilterDraft((current) => ({ ...current, minPrice: value }))} keyboardType="decimal-pad" placeholder={copy.minPrice} style={[styles.priceInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
          <TextInput testID="trip-price-max" value={filterDraft?.maxPrice ?? maxPrice} onChangeText={(value) => setFilterDraft((current) => ({ ...current, maxPrice: value }))} keyboardType="decimal-pad" placeholder={copy.maxPrice} style={[styles.priceInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        </View>
        <Text style={[styles.priceScope, { color: colors.textMuted }]}>{copy.priceScope}</Text>
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setFilterDraft((current) => ({ ...current, sortBy: 'newest', minPrice: '', maxPrice: '' }))}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="filter-sheet-apply" style={styles.sheetPrimary} onPress={applyFilterDraft}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {Gate}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  topBar: {
    minHeight: 42,
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: PAGE_BG,
  },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  feedControls: { paddingTop: 2, paddingBottom: 2 },
  routeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    marginHorizontal: 18,
    marginBottom: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    shadowColor: '#14211C',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 10,
  },
  routeHalf: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  routeValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  routeLabel: { fontSize: 11.5, lineHeight: 15, fontWeight: '600' },
  routeValue: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  filtersScroll: { flexGrow: 0, minHeight: 50, maxHeight: 50 },
  filters: { paddingHorizontal: 18, paddingVertical: 4, gap: 7, alignItems: 'center' },
  filterPill: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowOpacity: 0.025,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterPillText: { fontSize: 13, fontWeight: '600' },
  favoritesCount: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingTop: 0, paddingBottom: 28 },
  loadingWrap: { paddingHorizontal: 24, paddingTop: 5 },
  // Design v1 Commit 3: the card itself is the canonical MarketplaceCard
  // (radius 16, border, no shadow, no green rail) — the screen only keeps
  // its list spacing.
  cardSpacing: { marginHorizontal: 18, marginBottom: 7 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 65, gap: 11 },
  pageFooter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  emptyTitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryBtn: { marginTop: 5, minHeight: 44, borderRadius: 22, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 14, fontWeight: '700' },
  sheetLabel: { fontSize: 12, fontWeight: '700', marginBottom: 7 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22, paddingBottom: 8 },
  sheetSecondary: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sheetSecondaryText: { fontSize: 14, fontWeight: '700' },
  sheetPrimary: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bodyChip: { minHeight: 40, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bodyChipText: { fontSize: 13, fontWeight: '600' },
  bodyChipTextActive: { color: ACCENT },
  sortRow: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortRowText: { fontSize: 14, fontWeight: '600' },
  sortRowTextActive: { color: ACCENT },
  currencyOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  currencyChip: { minHeight: 40, minWidth: 62, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  priceInputs: { flexDirection: 'row', gap: 10 },
  priceInput: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  priceScope: { marginTop: 8, fontSize: 12, lineHeight: 17 },
  scrollTopButton: { position: 'absolute', right: 18, bottom: 92, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
