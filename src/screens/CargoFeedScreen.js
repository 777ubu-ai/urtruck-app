import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { formatTruckType } from '../utils/i18n';
import { useAuth, LEVELS } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { sanitizeForDisplay } from '../utils/normalizers';
import { localizeCargoName, localizePlace } from '../utils/places';
import { countryFlag } from '../utils/countryFlags';
import { useToast } from '../components/Toast';
import { useVerificationGate } from '../components/VerificationGate';
import { SkeletonCard } from '../components/Skeleton';
import LanguageSwitcher from '../components/LanguageSwitcher';
import BottomSheet from '../components/ui/v1/BottomSheet';
import DatePicker from '../components/DatePicker';
import LocationPickerModal from '../components/LocationPickerModal';
import { TRUCK_KEYS } from '../utils/truckConstants';
import { useV1Colors } from '../theme/designV1';
import { storage } from '../utils/storage';

const ACCENT = '#34936B';
const ACCENT_SOFT = '#EAF5EF';
const PAGE_BG = '#F7F9F7';
const SURFACE = '#FFFFFF';
const TEXT = '#17221E';
const TEXT_SECONDARY = '#606B66';
const TEXT_MUTED = '#808A85';
const BORDER = '#E5EAE7';

const COPY = {
  RU: { loading: 'Погрузка', negotiated: 'По договорённости', loadError: 'Не удалось загрузить грузы', empty: 'Подходящих грузов пока нет', retry: 'Повторить' },
  EN: { loading: 'Loading', negotiated: 'By agreement', loadError: 'Could not load cargoes', empty: 'No matching cargoes yet', retry: 'Retry' },
  ZH: { loading: '装货', negotiated: '面议', loadError: '无法加载货物', empty: '暂时没有合适的货物', retry: '重试' },
  KK: { loading: 'Тиеу', negotiated: 'Келісім бойынша', loadError: 'Жүктерді жүктеу мүмкін болмады', empty: 'Сәйкес жүк әзірге жоқ', retry: 'Қайталау' },
};

const MONTHS = {
  RU: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  EN: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  KK: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'],
};

const toIso = (value) => {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const formatPickupDate = (value, lang) => {
  const iso = toIso(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(value || '—');
  const day = Number(m[3]);
  const month = Number(m[2]);
  if (lang === 'ZH') return `${month}月${day}日`;
  const months = MONTHS[lang] || MONTHS.RU;
  return `${day} ${months[month - 1]}`;
};

const formatMoney = (amount, currency, copy) => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return copy.negotiated;
  const rounded = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  const [whole, fraction] = rounded.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${fraction ? `${grouped}.${fraction}` : grouped} ${String(currency || 'USD').toUpperCase()}`;
};

const normalizeCargo = (c, myUserId) => ({
  id: c.id,
  ownerId: c.owner_id,
  from: sanitizeForDisplay(c.from_city || c.from_point_name || ''),
  to: sanitizeForDisplay(c.to_city || c.to_point_name || ''),
  fromCountry: sanitizeForDisplay(c.from_country || ''),
  toCountry: sanitizeForDisplay(c.to_country || ''),
  cargo: sanitizeForDisplay(c.cargo_desc || ''),
  type: c.cargo_type || 'tent',
  tons: Number(c.weight_tons) || 0,
  m3: Number(c.volume_m3) || 0,
  price: Number(c.price) || 0,
  currency: c.currency || 'USD',
  pickup: c.pickup_date || '',
  photos: Array.isArray(c.photos) ? c.photos : [],
  createdAt: c.created_at || '',
  isMine: !!myUserId && c.owner_id === myUserId,
  _server: true,
});

function CargoCard({ item, lang, copy, saved, onToggleSaved, onPress, compact }) {
  const from = localizePlace(item.from, lang) || '—';
  const to = localizePlace(item.to, lang) || '—';
  const cargo = localizeCargoName(item.cargo, lang) || '—';
  const fromFlag = countryFlag(item.fromCountry);
  const toFlag = countryFlag(item.toCountry);
  const specs = [formatTruckType(item.type), item.m3 > 0 ? `${item.m3} ${lang === 'ZH' ? '立方米' : 'м³'}` : null, item.tons > 0 ? `${item.tons} ${lang === 'ZH' ? '吨' : lang === 'EN' ? 't' : 'т'}` : null].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[styles.card, compact && styles.cardCompact]}
      testID={`cargo-card-${item.id}`}
      accessibilityRole="button"
    >
      <View style={styles.greenRail} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <View style={styles.routeWrap} testID={`cargo-card-route-${item.id}`}>
            <View style={styles.routeLine}>
              {!!fromFlag && <Text style={styles.flag}>{fromFlag}</Text>}
              <Text style={styles.routeCity} numberOfLines={2}>{from}</Text>
              <Feather name="arrow-right" size={20} color={TEXT} style={styles.routeArrow} />
              <Text style={styles.routeCity} numberOfLines={2}>{to}</Text>
              {!!toFlag && <Text style={styles.flag}>{toFlag}</Text>}
            </View>
          </View>
          <Text style={styles.price} numberOfLines={1} testID={`cargo-card-price-${item.id}`}>
            {formatMoney(item.price, item.currency, copy)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Feather name="package" size={18} color={TEXT_SECONDARY} />
          <Text style={styles.infoText} numberOfLines={2}>{cargo}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="truck" size={18} color={TEXT_SECONDARY} />
          <Text style={styles.infoText} numberOfLines={1}>{specs || formatTruckType(item.type)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="calendar" size={18} color={TEXT_SECONDARY} />
          <Text style={styles.infoText}>{copy.loading}: {formatPickupDate(item.pickup, lang)}</Text>
        </View>
      </View>

      <Pressable
        onPress={(e) => { e?.stopPropagation?.(); onToggleSaved(); }}
        hitSlop={10}
        style={styles.bookmarkBtn}
        testID={`cargo-card-bookmark-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove bookmark' : 'Save cargo'}
      >
        <Feather name="bookmark" size={21} color={saved ? ACCENT : TEXT_SECONDARY} fill={saved ? ACCENT : 'transparent'} />
      </Pressable>
    </TouchableOpacity>
  );
}

export default function CargoFeedScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const myUserId = session?.user?.id;
  const isGuest = !session?.user?.role;
  const role = 'driver';
  const copy = COPY[lang] || COPY.RU;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [pageLimit, setPageLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [dirFrom, setDirFrom] = useState('');
  const [dirTo, setDirTo] = useState('');
  const [showDirFromPicker, setShowDirFromPicker] = useState(false);
  const [showDirToPicker, setShowDirToPicker] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [filterType, setFilterType] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [compact, setCompact] = useState(true);

  useEffect(() => {
    storage.get('ur_feed_compact').then((v) => {
      if (v === '0' || v === '1') setCompact(v === '1');
    }).catch(() => {});
  }, []);

  const toggleCompact = () => setCompact((current) => {
    const next = !current;
    storage.set('ur_feed_compact', next ? '1' : '0').catch(() => {});
    return next;
  });

  const loadSaved = useCallback(async () => {
    if (!myUserId) { setSavedIds(new Set()); return; }
    const r = await marketAPI.favList('cargo').catch(() => null);
    if (Array.isArray(r?.favorites)) setSavedIds(new Set(r.favorites.map((f) => String(f.item_id))));
  }, [myUserId]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const result = await marketAPI.listCargos({
        fromCity: dirFrom.trim() || '',
        toCity: dirTo.trim() || '',
        cargoType: filterType || '',
        limit: pageLimit,
      });
      const mapped = (result?.cargos || [])
        .filter((c) => !myUserId || c.owner_id !== myUserId)
        .map((c) => normalizeCargo(c, myUserId))
        .filter((c) => c.from && c.to);
      setItems(mapped);
    } catch (e) {
      console.warn('[CargoFeed] load failed:', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dirFrom, dirTo, filterType, pageLimit, myUserId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  useFocusEffect(useCallback(() => { load(); loadSaved(); }, [load, loadSaved]));

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dateStart = toIso(dateFrom);
    const dateEnd = toIso(dateTo);
    let data = items.filter((item) => {
      if (q) {
        const haystack = [item.from, item.to, item.cargo, formatTruckType(item.type), item.currency].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const pickup = toIso(item.pickup);
      if (dateStart && pickup && pickup < dateStart) return false;
      if (dateEnd && pickup && pickup > dateEnd) return false;
      return true;
    });
    if (sortBy === 'price-asc') data = [...data].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') data = [...data].sort((a, b) => b.price - a.price);
    if (sortBy === 'newest') data = [...data].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return data;
  }, [items, search, dateFrom, dateTo, sortBy]);

  const openCargo = async (item) => {
    const ok = await requireLevel(LEVELS.PHONE, 'open_detail', 'driver');
    if (!ok) return;
    const safePhotos = item.photos.filter((p) => typeof p === 'string' && p.length < 500);
    navigation.navigate('CargoDetail', {
      cargo: { ...item, photos: safePhotos, photo: null },
      cargoId: item.id,
      role,
    });
  };

  const toggleSaved = async (item) => {
    const ok = await requireLevel(LEVELS.PHONE, 'favorite_cargo', 'driver');
    if (!ok) return;
    const id = String(item.id);
    const had = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (had) next.delete(id); else next.add(id);
      return next;
    });
    try {
      const r = had
        ? await marketAPI.favRemove('cargo', id)
        : await marketAPI.favAdd('cargo', id, {
            from: item.from, to: item.to, cargo: item.cargo, type: item.type,
            tons: item.tons, m3: item.m3, pickup: item.pickup,
            price: item.price, currency: item.currency,
          });
      if (!r || r.ok !== true) throw new Error('favorite_failed');
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (had) next.add(id); else next.delete(id);
        return next;
      });
      toast(t('send_error'), 'error');
    }
  };

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    Promise.allSettled([load(), loadSaved()]).finally(() => setRefreshing(false));
  };

  const filterPill = (key, label, icon, active) => (
    <TouchableOpacity
      key={key}
      style={[styles.filterPill, active && styles.filterPillActive]}
      onPress={() => setActiveFilter(key)}
      testID={`cargo-filter-${key}`}
    >
      <Feather name={icon} size={17} color={active ? ACCENT : TEXT_SECONDARY} />
      <Text style={[styles.filterPillText, active && { color: ACCENT }]}>{label}</Text>
      <Feather name="chevron-down" size={16} color={TEXT_SECONDARY} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="cargo-screen">
      <View style={styles.brandBar}>
        {isGuest ? <LanguageSwitcher testID="feed-lang-switch" compact /> : <View style={{ width: 44 }} />}
        <Text style={styles.brand}>UrTruck</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile', { role })}
          style={styles.menuBtn}
          hitSlop={8}
          testID="feed-menu-btn"
          accessibilityLabel={t('tab_profile')}
        >
          <Feather name="menu" size={27} color={TEXT} />
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('cargos')}</Text>
          <Text style={styles.subtitle}>{t('feed_driver_subtitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={toggleCompact}
          style={styles.viewToggle}
          hitSlop={8}
          testID="feed-view-toggle"
          accessibilityLabel={compact ? t('feed_view_large') : t('feed_view_compact')}
        >
          <Feather name={compact ? 'grid' : 'list'} size={21} color={TEXT_SECONDARY} />
        </TouchableOpacity>
      </View>

      <View style={[styles.routeSelector, (dirFrom || dirTo) && { borderColor: ACCENT }]} testID="feed-route-selector">
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirFromPicker(true)} testID="feed-route-from">
          <View style={styles.routeLabelRow}>
            <Feather name="map-pin" size={15} color={TEXT_MUTED} />
            <Text style={styles.routeLabel}>{t('from')}</Text>
          </View>
          <Text style={[styles.routeValue, !dirFrom && styles.placeholder]} numberOfLines={1}>
            {dirFrom ? localizePlace(dirFrom, lang) : t('create_field_from_placeholder')}
          </Text>
        </TouchableOpacity>
        <Feather name="arrow-right" size={27} color={ACCENT} />
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirToPicker(true)} testID="feed-route-to">
          <View style={styles.routeLabelRow}>
            <Feather name="flag" size={15} color={TEXT_MUTED} />
            <Text style={styles.routeLabel}>{t('to')}</Text>
          </View>
          <Text style={[styles.routeValue, !dirTo && styles.placeholder]} numberOfLines={1}>
            {dirTo ? localizePlace(dirTo, lang) : t('create_field_to_placeholder')}
          </Text>
        </TouchableOpacity>
        {(dirFrom || dirTo) ? (
          <TouchableOpacity onPress={() => { setDirFrom(''); setDirTo(''); }} hitSlop={10} testID="feed-route-clear">
            <Feather name="x" size={17} color={TEXT_MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={23} color={TEXT_SECONDARY} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchRoute')}
          placeholderTextColor="#929B96"
          style={styles.searchInput}
          testID="cargo-search"
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Feather name="x" size={19} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filterPill('date', t('filter_date'), 'calendar', !!(dateFrom || dateTo))}
        {filterPill('body', t('filter_body'), 'truck', !!filterType)}
        {filterPill('price', t('filter_price'), 'dollar-sign', sortBy !== 'newest')}
      </ScrollView>

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CargoCard
              item={item}
              lang={lang}
              copy={copy}
              saved={savedIds.has(String(item.id))}
              onToggleSaved={() => toggleSaved(item)}
              onPress={() => openCargo(item)}
              compact={compact}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!loading && items.length >= pageLimit) setPageLimit((p) => p + 50);
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              {error ? <Feather name="alert-circle" size={34} color={TEXT_MUTED} /> : <Feather name="package" size={34} color={TEXT_MUTED} />}
              <Text style={styles.emptyTitle}>{error ? copy.loadError : copy.empty}</Text>
              {error && (
                <TouchableOpacity style={styles.retryBtn} onPress={load} testID="cargo-retry">
                  <Text style={styles.retryText}>{copy.retry}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      <LocationPickerModal
        visible={showDirFromPicker}
        onClose={() => setShowDirFromPicker(false)}
        title={t('loc_from_title')}
        showGeo
        onSelect={(value, point) => setDirFrom((point && point.name) || value || '')}
      />
      <LocationPickerModal
        visible={showDirToPicker}
        onClose={() => setShowDirToPicker(false)}
        title={t('loc_to_title')}
        onSelect={(value, point) => setDirTo((point && point.name) || value || '')}
      />

      <BottomSheet visible={activeFilter === 'date'} onClose={() => setActiveFilter(null)} title={t('filter_date')}>
        <Text style={styles.sheetLabel}>{t('filter_date_from')}</Text>
        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={t('date_placeholder')} />
        <Text style={[styles.sheetLabel, { marginTop: 14 }]}>{t('filter_date_to')}</Text>
        <DatePicker value={dateTo} onChange={setDateTo} placeholder={t('date_placeholder')} />
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetSecondary} onPress={() => { setDateFrom(''); setDateTo(''); }}>
            <Text style={styles.sheetSecondaryText}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeFilter === 'body'} onClose={() => setActiveFilter(null)} title={t('filter_body')}>
        <View style={styles.bodyGrid}>
          <TouchableOpacity style={[styles.bodyChip, !filterType && styles.bodyChipActive]} onPress={() => setFilterType(null)}>
            <Text style={[styles.bodyChipText, !filterType && styles.bodyChipTextActive]}>{t('filter_all')}</Text>
          </TouchableOpacity>
          {TRUCK_KEYS.map((key) => (
            <TouchableOpacity key={key} style={[styles.bodyChip, filterType === key && styles.bodyChipActive]} onPress={() => setFilterType(filterType === key ? null : key)}>
              <Text style={[styles.bodyChipText, filterType === key && styles.bodyChipTextActive]}>{formatTruckType(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetSecondary} onPress={() => setFilterType(null)}><Text style={styles.sheetSecondaryText}>{t('filter_reset')}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}><Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text></TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeFilter === 'price'} onClose={() => setActiveFilter(null)} title={t('filter_price')}>
        {[['newest', t('filter_newest')], ['price-asc', t('filter_price_asc')], ['price-desc', t('filter_price_desc')]].map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.sortRow, sortBy === key && styles.sortRowActive]} onPress={() => setSortBy(key)}>
            <Text style={[styles.sortText, sortBy === key && { color: ACCENT }]}>{label}</Text>
            {sortBy === key && <Feather name="check" size={19} color={ACCENT} />}
          </TouchableOpacity>
        ))}
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetSecondary} onPress={() => setSortBy('newest')}><Text style={styles.sheetSecondaryText}>{t('filter_reset')}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}><Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text></TouchableOpacity>
        </View>
      </BottomSheet>

      {Gate}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  brandBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 7, paddingBottom: 8 },
  brand: { flex: 1, textAlign: 'center', fontSize: 29, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, color: TEXT },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14, gap: 14 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4, color: TEXT },
  subtitle: { marginTop: 3, fontSize: 14, lineHeight: 20, fontWeight: '400', color: TEXT_MUTED },
  viewToggle: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  routeSelector: { flexDirection: 'row', alignItems: 'center', minHeight: 96, marginHorizontal: 24, marginBottom: 14, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, shadowColor: '#14211C', shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1, gap: 12 },
  routeHalf: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  routeLabel: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: TEXT_SECONDARY },
  routeValue: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: TEXT },
  placeholder: { color: '#727D77' },
  searchWrap: { minHeight: 60, marginHorizontal: 24, marginBottom: 14, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 22, color: TEXT, paddingVertical: 0, outlineStyle: 'none' },
  filters: { paddingHorizontal: 24, paddingBottom: 14, gap: 10 },
  filterPill: { height: 50, paddingHorizontal: 16, borderRadius: 25, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#14211C', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  filterPillActive: { borderColor: '#BFDCCF', backgroundColor: '#FAFDFC' },
  filterPillText: { fontSize: 15, fontWeight: '600', color: TEXT_SECONDARY },
  listContent: { paddingHorizontal: 24, paddingBottom: 30 },
  card: { minHeight: 142, marginBottom: 9, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, overflow: 'hidden', shadowColor: '#15211C', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1, flexDirection: 'row' },
  cardCompact: { minHeight: 132 },
  greenRail: { width: 4, backgroundColor: '#3A9972' },
  cardBody: { flex: 1, paddingLeft: 15, paddingRight: 16, paddingTop: 14, paddingBottom: 13 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  routeWrap: { flex: 1, minWidth: 0, paddingRight: 4 },
  routeLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 7, rowGap: 2 },
  routeCity: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.25, color: TEXT, flexShrink: 1 },
  routeArrow: { marginHorizontal: 1 },
  flag: { fontSize: 21, lineHeight: 23 },
  price: { maxWidth: '40%', flexShrink: 0, textAlign: 'right', fontSize: 21, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, color: TEXT },
  infoRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 9, paddingRight: 42 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '450', color: '#39443F' },
  bookmarkBtn: { position: 'absolute', right: 13, bottom: 11, width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 70, gap: 12 },
  emptyTitle: { fontSize: 15, lineHeight: 21, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: { marginTop: 6, minHeight: 44, borderRadius: 22, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT_SOFT },
  retryText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  sheetLabel: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, marginBottom: 7 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22, paddingBottom: 8 },
  sheetSecondary: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  sheetSecondaryText: { color: TEXT_SECONDARY, fontSize: 14, fontWeight: '700' },
  sheetPrimary: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bodyChip: { minHeight: 40, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  bodyChipActive: { borderColor: '#BFDCCF', backgroundColor: ACCENT_SOFT },
  bodyChipText: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: '600' },
  bodyChipTextActive: { color: ACCENT },
  sortRow: { minHeight: 50, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE },
  sortRowActive: { borderColor: '#BFDCCF', backgroundColor: '#FAFDFC' },
  sortText: { fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY },
});
