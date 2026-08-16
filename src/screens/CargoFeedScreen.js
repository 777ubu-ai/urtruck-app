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

const FLAG_PAIR_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

const normalizeCountryCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
};

const extractEmbeddedFlag = (value) => {
  const m = String(value || '').match(FLAG_PAIR_RE);
  return m?.[0] || '';
};

const cleanRoutePlace = (value, countryCode) => {
  let text = sanitizeForDisplay(value || '')
    .replace(FLAG_PAIR_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*$/, '')
    .trim();
  if (countryCode) {
    text = text
      .replace(new RegExp(`[,\\s]+${countryCode}$`, 'i'), '')
      .replace(/\s*,\s*$/, '')
      .trim();
  }
  return text;
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

const normalizeCargo = (c, myUserId) => {
  const rawFrom = sanitizeForDisplay(c.from_city || c.from_point_name || '');
  const rawTo = sanitizeForDisplay(c.to_city || c.to_point_name || '');
  const fromCountry = normalizeCountryCode(c.from_country);
  const toCountry = normalizeCountryCode(c.to_country);
  return {
    id: c.id,
    ownerId: c.owner_id,
    from: cleanRoutePlace(rawFrom, fromCountry),
    to: cleanRoutePlace(rawTo, toCountry),
    fromCountry,
    toCountry,
    fromEmbeddedFlag: extractEmbeddedFlag(rawFrom),
    toEmbeddedFlag: extractEmbeddedFlag(rawTo),
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
  };
};

function CargoCard({ item, lang, copy, saved, onToggleSaved, onPress, compact }) {
  const from = localizePlace(item.from, lang) || '—';
  const to = localizePlace(item.to, lang) || '—';
  const cargo = localizeCargoName(item.cargo, lang) || '—';
  const fromFlag = countryFlag(item.fromCountry) || item.fromEmbeddedFlag;
  const toFlag = countryFlag(item.toCountry) || item.toEmbeddedFlag;
  const units = {
    volume: lang === 'ZH' ? '立方米' : 'м³',
    tons: lang === 'ZH' ? '吨' : lang === 'EN' ? 't' : 'т',
  };
  const specs = [
    formatTruckType(item.type),
    item.m3 > 0 ? `${item.m3} ${units.volume}` : null,
    item.tons > 0 ? `${item.tons} ${units.tons}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[styles.card, compact ? styles.cardCompact : styles.cardExpanded]}
      testID={`cargo-card-${item.id}`}
      accessibilityRole="button"
    >
      <View style={styles.greenRail} />
      <View style={[styles.cardBody, compact ? styles.cardBodyCompact : styles.cardBodyExpanded]}>
        <View style={[styles.cardTopRow, compact && styles.cardTopRowCompact]}>
          <View style={styles.routeWrap} testID={`cargo-card-route-${item.id}`}>
            <View style={styles.routeLine}>
              <View style={styles.placeInline}>
                {!!fromFlag && <Text style={[styles.flag, compact && styles.flagCompact]}>{fromFlag}</Text>}
                <Text style={[styles.routeCity, compact && styles.routeCityCompact]} numberOfLines={1}>{from}</Text>
              </View>
              <Feather name="arrow-right" size={compact ? 18 : 20} color={TEXT} style={styles.routeArrow} />
              <View style={styles.placeInline}>
                {!!toFlag && <Text style={[styles.flag, compact && styles.flagCompact]}>{toFlag}</Text>}
                <Text style={[styles.routeCity, compact && styles.routeCityCompact]} numberOfLines={1}>{to}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.cargoPriceRow, compact && styles.cargoPriceRowCompact]}>
          <View style={[styles.infoRow, styles.cargoInfoRow, compact && styles.infoRowCompact]}>
            <Feather name="package" size={compact ? 15 : 17} color={TEXT_SECONDARY} />
            <Text style={[styles.infoText, compact && styles.infoTextCompact]} numberOfLines={1}>{cargo}</Text>
          </View>
          <Text style={[styles.price, compact && styles.priceCompact]} numberOfLines={1} testID={`cargo-card-price-${item.id}`}>
            {formatMoney(item.price, item.currency, copy)}
          </Text>
        </View>
        <View style={[styles.infoRow, compact && styles.infoRowCompact]}>
          <Feather name="truck" size={compact ? 15 : 17} color={TEXT_SECONDARY} />
          <Text style={[styles.infoText, compact && styles.infoTextCompact]} numberOfLines={1}>{specs || formatTruckType(item.type)}</Text>
        </View>
        <View style={[styles.infoRow, compact && styles.infoRowCompact]}>
          <Feather name="calendar" size={compact ? 15 : 17} color={TEXT_SECONDARY} />
          <Text style={[styles.infoText, compact && styles.infoTextCompact]} numberOfLines={1}>
            {copy.loading}: {formatPickupDate(item.pickup, lang)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={(e) => { e?.stopPropagation?.(); onToggleSaved(); }}
        hitSlop={10}
        style={[styles.bookmarkBtn, compact && styles.bookmarkBtnCompact, saved && styles.bookmarkBtnSaved]}
        testID={`cargo-card-bookmark-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove bookmark' : 'Save cargo'}
      >
        {saved ? (
          <FontAwesome5 name="bookmark" size={compact ? 18 : 21} color={ACCENT} solid />
        ) : (
          <Feather name="bookmark" size={compact ? 18 : 21} color={TEXT_SECONDARY} />
        )}
      </Pressable>
    </TouchableOpacity>
  );
}

export default function CargoFeedScreen({ navigation }) {
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
    storage.get('ur_feed_compact').then((value) => {
      if (value === '0' || value === '1') setCompact(value === '1');
    }).catch(() => {});
  }, []);

  const toggleCompact = () => setCompact((current) => {
    const next = !current;
    storage.set('ur_feed_compact', next ? '1' : '0').catch(() => {});
    return next;
  });

  const loadSaved = useCallback(async () => {
    if (!myUserId) {
      setSavedIds(new Set());
      return;
    }
    const result = await marketAPI.favList('cargo').catch(() => null);
    if (Array.isArray(result?.favorites)) {
      setSavedIds(new Set(result.favorites.map((favorite) => String(favorite.item_id))));
    }
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
        .filter((cargo) => !myUserId || cargo.owner_id !== myUserId)
        .map((cargo) => normalizeCargo(cargo, myUserId))
        .filter((cargo) => cargo.from && cargo.to);
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
  useFocusEffect(useCallback(() => {
    load();
    loadSaved();
  }, [load, loadSaved]));

  const visibleItems = useMemo(() => {
    const dateStart = toIso(dateFrom);
    const dateEnd = toIso(dateTo);
    let data = items.filter((item) => {
      const pickup = toIso(item.pickup);
      if (dateStart && pickup && pickup < dateStart) return false;
      if (dateEnd && pickup && pickup > dateEnd) return false;
      return true;
    });
    if (sortBy === 'price-asc') data = [...data].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') data = [...data].sort((a, b) => b.price - a.price);
    if (sortBy === 'newest') data = [...data].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return data;
  }, [items, dateFrom, dateTo, sortBy]);

  const openCargo = async (item) => {
    const ok = await requireLevel(LEVELS.PHONE, 'open_detail', 'driver');
    if (!ok) return;
    const safePhotos = item.photos.filter((photo) => typeof photo === 'string' && photo.length < 500);
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
      const result = had
        ? await marketAPI.favRemove('cargo', id)
        : await marketAPI.favAdd('cargo', id, {
            from: item.from,
            to: item.to,
            cargo: item.cargo,
            type: item.type,
            tons: item.tons,
            m3: item.m3,
            pickup: item.pickup,
            price: item.price,
            currency: item.currency,
          });
      if (!result || result.ok !== true) throw new Error('favorite_failed');
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
      <Feather name={icon} size={16} color={active ? ACCENT : TEXT_SECONDARY} />
      <Text style={[styles.filterPillText, active && { color: ACCENT }]}>{label}</Text>
      <Feather name="chevron-down" size={15} color={TEXT_SECONDARY} />
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
          <Feather name="menu" size={26} color={TEXT} />
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
          <Feather name={compact ? 'grid' : 'list'} size={20} color={TEXT_SECONDARY} />
        </TouchableOpacity>
      </View>

      <View style={[styles.routeSelector, (dirFrom || dirTo) && { borderColor: ACCENT }]} testID="feed-route-selector">
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirFromPicker(true)} testID="feed-route-from">
          <View style={styles.routeLabelRow}>
            <Feather name="map-pin" size={14} color={TEXT_MUTED} />
            <Text style={styles.routeLabel}>{t('from')}</Text>
          </View>
          <Text style={[styles.routeValue, !dirFrom && styles.placeholder]} numberOfLines={1}>
            {dirFrom ? localizePlace(dirFrom, lang) : t('create_field_from_placeholder')}
          </Text>
        </TouchableOpacity>
        <Feather name="arrow-right" size={24} color={ACCENT} />
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirToPicker(true)} testID="feed-route-to">
          <View style={styles.routeLabelRow}>
            <Feather name="flag" size={14} color={TEXT_MUTED} />
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filters}
      >
        {filterPill('date', t('filter_date'), 'calendar', !!(dateFrom || dateTo))}
        {filterPill('body', t('filter_body'), 'truck', !!filterType)}
        {filterPill('price', t('filter_price'), 'dollar-sign', sortBy !== 'newest')}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingWrap}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          style={styles.list}
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
              <Feather name={error ? 'alert-circle' : 'package'} size={32} color={TEXT_MUTED} />
              <Text style={styles.emptyTitle}>{error ? copy.loadError : copy.empty}</Text>
              {error ? (
                <TouchableOpacity style={styles.retryBtn} onPress={load} testID="cargo-retry">
                  <Text style={styles.retryText}>{copy.retry}</Text>
                </TouchableOpacity>
              ) : null}
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
            <TouchableOpacity
              key={key}
              style={[styles.bodyChip, filterType === key && styles.bodyChipActive]}
              onPress={() => setFilterType(filterType === key ? null : key)}
            >
              <Text style={[styles.bodyChipText, filterType === key && styles.bodyChipTextActive]}>{formatTruckType(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetSecondary} onPress={() => setFilterType(null)}>
            <Text style={styles.sheetSecondaryText}>{t('filter_reset')}</Text>
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
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.sortRow, sortBy === key && styles.sortRowActive]}
            onPress={() => setSortBy(key)}
          >
            <Text style={[styles.sortText, sortBy === key && { color: ACCENT }]}>{label}</Text>
            {sortBy === key ? <Feather name="check" size={18} color={ACCENT} /> : null}
          </TouchableOpacity>
        ))}
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetSecondary} onPress={() => setSortBy('newest')}>
            <Text style={styles.sheetSecondaryText}>{t('filter_reset')}</Text>
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
  brandBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 6, paddingBottom: 4 },
  brand: { flex: 1, textAlign: 'center', fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: TEXT },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 5, paddingBottom: 10, gap: 12 },
  title: { fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, color: TEXT },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '400', color: TEXT_MUTED },
  viewToggle: { width: 45, height: 45, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  routeSelector: { flexDirection: 'row', alignItems: 'center', minHeight: 88, marginHorizontal: 24, marginBottom: 10, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, shadowColor: '#14211C', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1, gap: 10 },
  routeHalf: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  routeLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: TEXT_SECONDARY },
  routeValue: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: TEXT },
  placeholder: { color: '#727D77' },
  filtersScroll: { flexGrow: 0, minHeight: 60, maxHeight: 60, marginBottom: 4 },
  filters: { paddingHorizontal: 24, paddingVertical: 5, gap: 9, alignItems: 'center' },
  filterPill: { height: 48, paddingHorizontal: 15, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, flexDirection: 'row', alignItems: 'center', gap: 7, shadowColor: '#14211C', shadowOpacity: 0.025, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  filterPillActive: { borderColor: '#BFDCCF', backgroundColor: '#FAFDFC' },
  filterPillText: { fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY },
  list: { flex: 1 },
  loadingWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 5 },
  listContent: { paddingHorizontal: 24, paddingTop: 5, paddingBottom: 28 },
  card: { marginBottom: 8, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, overflow: 'hidden', shadowColor: '#15211C', shadowOpacity: 0.035, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1, flexDirection: 'row' },
  cardCompact: { minHeight: 120 },
  cardExpanded: { minHeight: 145 },
  greenRail: { width: 4, backgroundColor: '#3A9972' },
  cardBody: { flex: 1 },
  cardBodyCompact: { paddingLeft: 13, paddingRight: 13, paddingTop: 11, paddingBottom: 9 },
  cardBodyExpanded: { paddingLeft: 15, paddingRight: 16, paddingTop: 14, paddingBottom: 13 },
  cardTopRow: { marginBottom: 8 },
  cardTopRowCompact: { marginBottom: 6 },
  routeWrap: { width: '100%', minWidth: 0 },
  routeLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 6, width: '100%' },
  placeInline: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: 1, maxWidth: '44%' },
  routeCity: { fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.25, color: TEXT, flexShrink: 1 },
  routeCityCompact: { fontSize: 16, lineHeight: 20 },
  routeArrow: { marginHorizontal: 0, flexShrink: 0 },
  flag: { fontSize: 20, lineHeight: 22 },
  flagCompact: { fontSize: 18, lineHeight: 20 },
  cargoPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 23 },
  cargoPriceRowCompact: { minHeight: 20 },
  cargoInfoRow: { flex: 1, minWidth: 0, paddingRight: 0 },
  price: { maxWidth: '38%', flexShrink: 0, textAlign: 'right', fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, color: TEXT },
  priceCompact: { fontSize: 18, lineHeight: 21, maxWidth: '37%' },
  infoRow: { minHeight: 23, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 42 },
  infoRowCompact: { minHeight: 20, gap: 7, paddingRight: 38 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '400', color: '#39443F' },
  infoTextCompact: { fontSize: 12.5, lineHeight: 17 },
  bookmarkBtn: { position: 'absolute', right: 12, bottom: 9, width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bookmarkBtnCompact: { right: 9, bottom: 6, width: 40, height: 40 },
  bookmarkBtnSaved: { backgroundColor: ACCENT_SOFT },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 65, gap: 11 },
  emptyTitle: { fontSize: 14, lineHeight: 20, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: { marginTop: 5, minHeight: 44, borderRadius: 22, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT_SOFT },
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
