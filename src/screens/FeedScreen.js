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
import { useToast } from '../components/Toast';
import { useVerificationGate } from '../components/VerificationGate';
import { SkeletonCard } from '../components/Skeleton';
import NotificationBellButton from '../components/ui/v1/NotificationBellButton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import DatePicker from '../components/DatePicker';
import RoutePointPickerV2 from '../components/RoutePointPickerV2';
import { locationName, routeFilterParams, routePointLabel } from '../utils/geoCatalog';
import { SCOPE_LABELS, routeStrings } from '../utils/routeFilterStrings';
import {
  FEED_KEYS, canRestoreFeed, readFeedSnapshot, writeFeedSnapshot,
} from '../utils/feedSessionState';
import { TRUCK_KEYS } from '../utils/truckConstants';

const ACCENT = '#34936B';
const ACCENT_SOFT = '#EAF5EF';
const PAGE_BG = '#F7F9F7';
const SURFACE = '#FFFFFF';
const TEXT = '#17221E';
const TEXT_SECONDARY = '#606B66';
const TEXT_MUTED = '#808A85';
const BORDER = '#E5EAE7';

const COPY = {
  RU: {
    favorites: 'Избранное', empty: 'Подходящих машин пока нет', loadError: 'Не удалось загрузить машины',
    retry: 'Повторить', perTrip: 'за рейс', departure: 'Выезд',
  },
  EN: {
    favorites: 'Saved', empty: 'No matching trucks yet', loadError: 'Could not load trucks',
    retry: 'Retry', perTrip: 'per trip', departure: 'Departure',
  },
  ZH: {
    favorites: '收藏', empty: '暂时没有合适的车辆', loadError: '无法加载车辆',
    retry: '重试', perTrip: '每趟', departure: '出发',
  },
  KK: {
    favorites: 'Таңдаулы', empty: 'Сәйкес көлік әзірге жоқ', loadError: 'Көліктерді жүктеу мүмкін болмады',
    retry: 'Қайталау', perTrip: 'рейске', departure: 'Шығу',
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

const foldRouteText = (value) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/\s+/g, ' ')
  .trim();

const routePointMatchesItem = (point, city, countryCode) => {
  if (!point?.countryId) return true;
  if (countryCode && String(countryCode).toUpperCase() !== point.countryId) return false;
  if (!point.locationId) return true;
  const actual = foldRouteText(city);
  const expectedNames = ['ru', 'en', 'zh', 'kk']
    .map((locale) => foldRouteText(locationName(point.locationId, locale)))
    .filter(Boolean);
  return expectedNames.includes(actual);
};

const tripMatchesRouteFilter = (trip, origin, destination) => (
  routePointMatchesItem(origin, trip.from, trip.fromCountry)
  && routePointMatchesItem(destination, trip.to, trip.toCountry)
);

const feedPalette = (theme, isDark) => ({
  pageBg: theme.bg || PAGE_BG,
  surface: theme.card || theme.surface || SURFACE,
  text: theme.text || TEXT,
  textSecondary: theme.textSecondary || TEXT_SECONDARY,
  textMuted: theme.textMuted || TEXT_MUTED,
  border: theme.border || BORDER,
  shadow: isDark ? '#000000' : '#14211C',
  accent: ACCENT,
  accentSoft: ACCENT_SOFT,
  filterActive: isDark ? (theme.surfaceAlt || theme.card || theme.surface || SURFACE) : '#FAFDFC',
  favoriteBg: isDark ? (theme.surfaceAlt || theme.card || theme.surface || SURFACE) : '#F5FBF8',
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
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          shadowColor: colors.shadow,
        },
      ]}
      testID={`trip-card-${item.id}`}
      accessibilityRole="button"
    >
      <View style={styles.greenRail} />
      <View style={styles.cardBody}>
        <Text style={[styles.route, { color: colors.text }]} numberOfLines={2}>
          {display.from} → {display.to}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {[item.departure ? `${copy.departure}: ${display.departure}` : null, specs || null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <View style={styles.priceWrap}>
        <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>{display.price}</Text>
        <Text style={[styles.perTrip, { color: colors.textMuted }]}>{copy.perTrip}</Text>
      </View>

      <Pressable
        onPress={(event) => { event?.stopPropagation?.(); onToggleSaved(); }}
        hitSlop={10}
        style={[
          styles.bookmarkBtn,
          { backgroundColor: colors.favoriteBg },
          saved && { backgroundColor: colors.accentSoft },
        ]}
        testID={`trip-card-bookmark-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove saved trip' : 'Save trip'}
        accessibilityState={{ selected: saved }}
      >
        {saved ? (
          <FontAwesome5 name="bookmark" size={18} color={colors.accent} solid />
        ) : (
          <Feather name="bookmark" size={18} color={colors.accent} />
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

  // §20: начальное состояние берём из session-снимка. Ленивый инициализатор,
  // а не useEffect: иначе первый рендер после Back успевал показать пустую
  // ленту и сбросить позицию скролла до восстановления.
  const snapshot = React.useRef(readFeedSnapshot(FEED_KEYS.TRUCKS)).current;
  const [items, setItems] = useState(snapshot.items || []);
  const [loading, setLoading] = useState(!snapshot.items);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [pageLimit, setPageLimit] = useState(snapshot.pageLimit || 50);
  // Main Route Filter V2 (§3/§4): канонический маршрутный scope
  // { countryId, locationId | null }. locationId === null означает
  // «вся страна» — это scope, а не город с таким названием.
  // Свободный текст dirFrom/dirTo больше не источник истины: он гонял
  // `from_city LIKE '%…%'` и на 10 000 объявлений давал и full scan,
  // и ложные совпадения.
  const [routeOrigin, setRouteOrigin] = useState(snapshot.origin || null);
  const [routeDestination, setRouteDestination] = useState(snapshot.destination || null);
  const [showDirFromPicker, setShowDirFromPicker] = useState(false);
  const [showDirToPicker, setShowDirToPicker] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [filterType, setFilterType] = useState(snapshot.filters?.filterType ?? null);
  const [dateFrom, setDateFrom] = useState(snapshot.filters?.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(snapshot.filters?.dateTo ?? '');
  const [sortBy, setSortBy] = useState(snapshot.filters?.sortBy ?? 'newest');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [savedOnly, setSavedOnly] = useState(snapshot.filters?.savedOnly ?? false);
  const savedBusyRef = React.useRef(new Set());

  // §8/§9: подпись берётся из каталога — «Весь Китай», «Алматы»,
  // «Нур Жолы · КПП» — и меняется вместе с языком без пересборки фильтра.
  const routeValue = (point, placeholder) => (point
    ? routePointLabel(point, lang, SCOPE_LABELS)
    : placeholder);

  const hasRouteFilter = !!(routeOrigin || routeDestination);

  const resetRoute = useCallback(() => {
    setRouteOrigin(null);
    setRouteDestination(null);
  }, []);

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

  // §17: держим контроллер последнего запроса. При смене фильтра предыдущий
  // отменяется, иначе его поздний ответ перезаписывал бы ленту нового
  // фильтра — на медленной сети пользователь видел результаты чужого
  // маршрута.
  const inflightRef = React.useRef(null);

  const load = useCallback(async () => {
    setError(false);
    inflightRef.current?.abort?.();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    inflightRef.current = controller;
    try {
      const result = await marketAPI.listTrips({
        // §15: фильтрация по маршруту — на сервере, а не после выкачивания
        // всей ленты на телефон.
        origin: routeOrigin,
        destination: routeDestination,
        truckType: filterType || '',
        limit: pageLimit,
        signal: controller?.signal,
      });
      // Отменённый запрос — не ошибка и не пустая лента: его результат
      // просто больше не нужен.
      if (result?.aborted || controller?.signal?.aborted) return;
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
        .filter((trip) => trip?.id && trip.from && trip.to)
        .filter((trip) => tripMatchesRouteFilter(trip, routeOrigin, routeDestination));
      setItems(mapped);
    } catch (err) {
      console.warn('[FeedScreen] load trips failed:', err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [routeOrigin, routeDestination, filterType, pageLimit, myUserId]);

  // ── §20 return state ────────────────────────────────────────────────
  const listRef = React.useRef(null);
  const scrollOffsetRef = React.useRef(snapshot.scrollOffset || 0);
  const restoredRef = React.useRef(false);

  const currentFilters = useMemo(() => ({
    filterType, dateFrom, dateTo, sortBy, savedOnly,
  }), [filterType, dateFrom, dateTo, sortBy, savedOnly]);

  const scopeForSnapshot = useMemo(() => ({
    origin: routeOrigin, destination: routeDestination, filters: currentFilters,
  }), [routeOrigin, routeDestination, currentFilters]);

  // Фильтры пишем в снимок сразу — даже если результаты ещё летят, Back
  // должен вернуть тот же фильтр, а не пустой.
  useEffect(() => {
    writeFeedSnapshot(FEED_KEYS.TRUCKS, scopeForSnapshot);
  }, [scopeForSnapshot]);

  // Загруженные страницы кладём в снимок, чтобы Back не перезапрашивал их.
  useEffect(() => {
    if (loading) return;
    writeFeedSnapshot(FEED_KEYS.TRUCKS, { items, pageLimit });
  }, [items, pageLimit, loading]);

  const onFeedScroll = useCallback((event) => {
    const y = event?.nativeEvent?.contentOffset?.y;
    if (!Number.isFinite(y)) return;
    scrollOffsetRef.current = y;
    writeFeedSnapshot(FEED_KEYS.TRUCKS, { scrollOffset: y });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  useFocusEffect(useCallback(() => {
    // Возврат с карточки НЕ должен перезапрашивать ленту: раньше focus
    // безусловно вызывал load(), из-за чего уже загруженные страницы
    // выбрасывались и позиция скролла обнулялась. Перезапрашиваем только
    // когда восстанавливать нечего или фильтр изменился.
    if (!canRestoreFeed(FEED_KEYS.TRUCKS, scopeForSnapshot)) {
      load();
    }
    // Избранное дешёвое и может измениться из карточки — обновляем всегда.
    loadSaved();
  }, [load, loadSaved, scopeForSnapshot]));

  // Позицию возвращаем после того, как список получил данные.
  useFocusEffect(useCallback(() => {
    const target = scrollOffsetRef.current;
    if (!target || restoredRef.current || !items.length) return;
    restoredRef.current = true;
    // requestAnimationFrame, а не setTimeout: ждём ближайший кадр после
    // коммита, иначе scrollToOffset уходит в ещё не смонтированный список.
    const raf = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset?.({ offset: target, animated: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [items.length]));

  // Уход с экрана — снимок закрыт для восстановления в следующий раз.
  useFocusEffect(useCallback(() => () => { restoredRef.current = false; }, []));

  const visibleItems = useMemo(() => {
    const dateStart = toIso(dateFrom);
    const dateEnd = toIso(dateTo);
    let data = items.filter((item) => {
      const departure = toIso(item.departure);
      if (dateStart && departure && departure < dateStart) return false;
      if (dateEnd && departure && departure > dateEnd) return false;
      // §15: фильтр по стране БОЛЬШЕ НЕ выполняется здесь. Раньше сервер
      // отдавал ленту целиком, а телефон отсеивал чужие страны локально —
      // на 10 000 объявлениях это и трафик, и пустые страницы после
      // отсева. Теперь страна и локация уходят в SQL
      // (origin_/destination_country_id + _location_id).
      if (savedOnly && !savedIds.has(String(item.id))) return false;
      return true;
    });

    if (sortBy === 'price-asc') {
      data = [...data].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === 'price-desc') {
      data = [...data].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else {
      data = [...data].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
    return data;
  }, [items, dateFrom, dateTo, sortBy, savedOnly, savedIds]);

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
            borderColor: hasRouteFilter ? colors.accent : colors.border,
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
          <Text
            style={[styles.routeValue, { color: routeOrigin ? colors.text : colors.textMuted }]}
            numberOfLines={1}
            testID="feed-route-from-value"
          >
            {routeValue(routeOrigin, t('create_field_from_placeholder'))}
          </Text>
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
          <Text
            style={[styles.routeValue, { color: routeDestination ? colors.text : colors.textMuted }]}
            numberOfLines={1}
            testID="feed-route-to-value"
          >
            {routeValue(routeDestination, t('create_field_to_placeholder'))}
          </Text>
        </TouchableOpacity>

        {hasRouteFilter ? (
          <TouchableOpacity
            onPress={resetRoute}
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
          {savedIds.size > 0 ? (
            <Text style={[styles.favoritesCount, { color: colors.textSecondary }]}>{savedIds.size}</Text>
          ) : null}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.pageBg }]}
      edges={['top']}
      testID="trip-feed-screen"
    >
      <View
        style={[styles.topBar, { backgroundColor: colors.pageBg }]}
        testID="trip-feed-minimal-header"
      >
        <NotificationBellButton
          navigation={navigation}
          color={colors.text}
          testID="feed-notification-bell-btn"
        />
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
        ref={listRef}
        onScroll={onFeedScroll}
        // 16ms ≈ раз в кадр: реже теряется точность возврата, чаще — лишние
        // события на каждый пиксель прокрутки.
        scrollEventThrottle={16}
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
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loading && !savedOnly && items.length >= pageLimit) setPageLimit((value) => value + 50);
        }}
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

      {/* §3: «Откуда» и «Куда» — один и тот же компонент, симметрично. */}
      <RoutePointPickerV2
        visible={showDirFromPicker}
        onClose={() => setShowDirFromPicker(false)}
        onSelect={setRouteOrigin}
        value={routeOrigin}
        title={routeStrings(lang).route_from}
        lang={lang}
        testIDPrefix="feed-origin-picker"
      />
      <RoutePointPickerV2
        visible={showDirToPicker}
        onClose={() => setShowDirToPicker(false)}
        onSelect={setRouteDestination}
        value={routeDestination}
        title={routeStrings(lang).route_to}
        lang={lang}
        testIDPrefix="feed-destination-picker"
      />

      <BottomSheet
        visible={activeFilter === 'date'}
        onClose={() => setActiveFilter(null)}
        title={t('filter_date')}
      >
        <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>{t('filter_date_from')}</Text>
        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={t('date_placeholder')} />
        <Text style={[styles.sheetLabel, { color: colors.textMuted, marginTop: 14 }]}>{t('filter_date_to')}</Text>
        <DatePicker value={dateTo} onChange={setDateTo} placeholder={t('date_placeholder')} />
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => { setDateFrom(''); setDateTo(''); }}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={activeFilter === 'body'}
        onClose={() => setActiveFilter(null)}
        title={t('filter_body')}
      >
        <View style={styles.bodyGrid}>
          <TouchableOpacity
            style={[
              styles.bodyChip,
              { backgroundColor: colors.surface, borderColor: colors.border },
              !filterType && styles.bodyChipActive,
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
                filterType === key && styles.bodyChipActive,
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
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={activeFilter === 'price'}
        onClose={() => setActiveFilter(null)}
        title={t('filter_price')}
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
              sortBy === value && styles.sortRowActive,
            ]}
            onPress={() => setSortBy(value)}
          >
            <Text
              style={[
                styles.sortRowText,
                { color: colors.textSecondary },
                sortBy === value && styles.sortRowTextActive,
              ]}
            >
              {label}
            </Text>
            {sortBy === value ? <Feather name="check" size={18} color={ACCENT} /> : null}
          </TouchableOpacity>
        ))}
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.sheetSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setSortBy('newest')}
          >
            <Text style={[styles.sheetSecondaryText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
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
    // §11 Task 3: 68 → 52. Карточка маршрута была слишком высокой и съедала
    // место у ленты. Уменьшен ТОЛЬКО вертикальный запас: обе половины
    // остаются нажимаемыми (routeHalf minHeight 44), состав сохранён —
    // Откуда · значение → Куда · значение.
    minHeight: 52,
    marginHorizontal: 18,
    marginBottom: 6,
    paddingHorizontal: 13,
    paddingVertical: 6,
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
  // ≥44dp: селектор стал ниже, но нажимаемая зона половины сохранена (§11).
  routeHalf: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
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
  card: {
    // §13 Task 3: компактнее на 16dp (104 → 88). Уменьшен ТОЛЬКО лишний
    // вертикальный запас — состав карточки (маршрут, мета, цена, закладка)
    // сохранён полностью.
    minHeight: 88,
    marginHorizontal: 18,
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    shadowColor: '#15211C',
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    flexDirection: 'row',
  },
  greenRail: { width: 4, backgroundColor: '#3A9972' },
  // Раньше cardBody держал paddingRight: 145, потому что справа снизу стояли
  // И цена, И закладка. Закладка уехала вверх (§14), поэтому общий отступ
  // больше не нужен: каждая строка резервирует ровно свою зону, и текст
  // маршрута получил ~100dp дополнительной ширины.
  cardBody: { flex: 1, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 },
  // paddingRight: 48 — зона закладки в правом верхнем углу.
  route: { fontSize: 15.5, lineHeight: 20, fontWeight: '700', letterSpacing: -0.1, paddingRight: 48 },
  // paddingRight: 120 — зона цены в правом нижнем углу.
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500', marginTop: 5, paddingRight: 120 },
  // Цена больше не отступает на 58dp под закладку — та переехала наверх.
  priceWrap: { position: 'absolute', right: 12, bottom: 8, alignItems: 'flex-end', maxWidth: 130 },
  price: { fontSize: 16.5, lineHeight: 20, fontWeight: '800' },
  perTrip: { fontSize: 11.5, lineHeight: 15, marginTop: 1 },
  bookmarkBtn: {
    // §14: закладка ПОДНЯТА в правый верхний угол. Внизу она делила ряд с
    // ценой и заставляла карточку держать лишнюю высоту; теперь она в одной
    // визуальной строке с маршрутом и не занимает отдельного нижнего ряда.
    // Размер 40×40 сохранён — touch target не ужимаем (§14).
    position: 'absolute',
    right: 9,
    top: 6,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 65, gap: 11 },
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
  bodyChipActive: { borderColor: '#BFDCCF', backgroundColor: ACCENT_SOFT },
  bodyChipText: { fontSize: 13, fontWeight: '600' },
  bodyChipTextActive: { color: ACCENT },
  sortRow: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortRowActive: { borderColor: '#BFDCCF', backgroundColor: ACCENT_SOFT },
  sortRowText: { fontSize: 14, fontWeight: '600' },
  sortRowTextActive: { color: ACCENT },
});
