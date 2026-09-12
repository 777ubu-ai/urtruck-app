import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
import { flagCode } from '../utils/countryFlags';
import { useToast } from '../components/Toast';
import { useVerificationGate } from '../components/VerificationGate';
import { SkeletonCard } from '../components/Skeleton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import DatePicker from '../components/DatePicker';
import LocationPickerModal from '../components/LocationPickerModal';
import { TRUCK_KEYS } from '../utils/truckConstants';
import { useSafeRefresh } from '../hooks/useSafeRefresh';
import BellBadge from '../components/ui/v1/BellBadge';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import RootHeader from '../components/ui/v1/RootHeader';
import MarketplaceCard from '../components/ui/v1/MarketplaceCard';
import CompactFilterChip from '../components/ui/v1/CompactFilterChip';
import DriverRouteBackdrop from '../components/ui/v1/DriverRouteBackdrop';
import { DRIVER_CERAMIC } from '../theme/designV1Palette';

const ACCENT = DRIVER_CERAMIC.active;
const ACCENT_SOFT = DRIVER_CERAMIC.activeSoft;
const PAGE_BG = DRIVER_CERAMIC.bg;
const SURFACE = '#FFFFFF';
const TEXT = '#17221D';
const TEXT_SECONDARY = '#606B66';
const TEXT_MUTED = '#718078';
const BORDER = '#E5EAE7';

const cargoPalette = () => ({
  pageBg: DRIVER_CERAMIC.bg,
  surface: DRIVER_CERAMIC.surface,
  surfaceAlt: DRIVER_CERAMIC.surface,
  text: DRIVER_CERAMIC.text,
  textSecondary: DRIVER_CERAMIC.textMuted,
  textMuted: DRIVER_CERAMIC.textMuted,
  border: DRIVER_CERAMIC.border,
  shadow: DRIVER_CERAMIC.shadow,
  accent: ACCENT,
  accentSoft: ACCENT_SOFT,
  filterActive: ACCENT_SOFT,
  favoriteBg: DRIVER_CERAMIC.surface,
  priceText: DRIVER_CERAMIC.text,
});

const COPY = {
  RU: {
    loading: 'Погрузка', negotiated: 'По договорённости', loadError: 'Не удалось загрузить грузы',
    empty: 'Подходящих грузов пока нет', retry: 'Повторить', favorites: 'Избранное',
  },
  EN: {
    loading: 'Loading', negotiated: 'By agreement', loadError: 'Could not load cargoes',
    empty: 'No matching cargoes yet', retry: 'Retry', favorites: 'Favorites',
  },
  ZH: {
    loading: '装货', negotiated: '面议', loadError: '无法加载货物',
    empty: '暂时没有合适的货物', retry: '重试', favorites: '收藏',
  },
  KK: {
    loading: 'Тиеу', negotiated: 'Келісім бойынша', loadError: 'Жүктерді жүктеу мүмкін болмады',
    empty: 'Сәйкес жүк әзірге жоқ', retry: 'Қайталау', favorites: 'Таңдаулы',
  },
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

// CargoCard — canonical MarketplaceCard (Design v1 Commit 3). Emoji flags
// are replaced by the shared Flag component; the screen maps data to
// display strings only.
function CargoCard({ item, lang, t, copy, saved, onToggleSaved, onPress }) {
  const from = localizePlace(item.from, lang) || '—';
  const to = localizePlace(item.to, lang) || '—';
  const cargo = localizeCargoName(item.cargo, lang) || '—';
  const fromFlag = item.fromCountry || flagCode(item.fromEmbeddedFlag) || null;
  const toFlag = item.toCountry || flagCode(item.toEmbeddedFlag) || null;
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
    <MarketplaceCard
      testID={`cargo-card-${item.id}`}
      onPress={onPress}
      style={styles.cardSpacing}
      route={{
        from,
        to,
        fromFlag,
        toFlag,
        testID: `cargo-card-route-${item.id}`,
        numberOfLines: 1,
      }}
      price={formatMoney(item.price, item.currency, copy)}
      priceTestID={`cargo-card-price-${item.id}`}
      priceMeta={item.pickup ? formatPickupDate(item.pickup, lang) : null}
      meta={[specs || formatTruckType(item.type)]}
      description={cargo}
      variant="driver"
      compact
      bookmark={{
        saved,
        onToggle: onToggleSaved,
        testID: `cargo-card-bookmark-${item.id}`,
        accessibilityLabel: saved ? t('in_favorites') : t('add_to_favorites'),
      }}
    />
  );
}

export default function CargoFeedScreen({ navigation }) {
  const { t, lang } = useI18n();
  const palette = useMemo(() => cargoPalette(), []);
  const { session } = useAuth();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const myUserId = session?.user?.id;
  const role = 'driver';
  const copy = COPY[lang] || COPY.RU;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const savedBusyRef = React.useRef(new Set());

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
      const tons = Number(item.tons || 0);
      if (capacityFilter === 'light' && tons > 10) return false;
      if (capacityFilter === 'medium' && (tons <= 10 || tons > 20)) return false;
      if (capacityFilter === 'heavy' && tons <= 20) return false;
      if (savedOnly && !savedIds.has(String(item.id))) return false;
      return true;
    });
    data = [...data].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return data;
  }, [items, dateFrom, dateTo, capacityFilter, savedOnly, savedIds]);

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
        ? await marketAPI.favRemove('cargo', id)
        : await marketAPI.favAdd('cargo', id, {
            from: item.from,
            to: item.to,
            from_country: item.fromCountry || '',
            to_country: item.toCountry || '',
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
    } finally {
      savedBusyRef.current.delete(id);
    }
  };

  const toggleSavedOnly = async () => {
    if (!myUserId) {
      const ok = await requireLevel(LEVELS.PHONE, 'favorite_cargo', 'driver');
      if (!ok) return;
    }
    setSavedOnly((value) => !value);
  };

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => Promise.allSettled([load(), loadSaved()]), [load, loadSaved]),
  );

  const filterPill = (key, label, icon, active) => (
    <CompactFilterChip key={key} variant="driver" icon={icon} label={label} active={active} onPress={() => setActiveFilter(key)} testID={`cargo-filter-${key}`} />
  );

  const feedControls = (
    <View style={styles.feedControls} testID="cargo-feed-scroll-controls">
      <View
        style={[
          styles.routeSelector,
          {
            borderColor: (dirFrom || dirTo) ? palette.accent : palette.border,
            backgroundColor: palette.surface,
            shadowColor: palette.shadow,
          },
        ]}
        testID="feed-route-selector"
      >
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirFromPicker(true)} testID="feed-route-from">
          <View style={styles.routeLabelRow}>
            <Feather name="map-pin" size={14} color={palette.textMuted} />
            <Text style={[styles.routeLabel, { color: palette.textSecondary }]}>{t('from')}</Text>
          </View>
          {/* Track: Claude harness fix, feed placeholder truncation. Was
              t('create_field_from_placeholder') ('Например, Алматы') — sized
              for CreateTripScreen.js's full-width input, not this ~50%-width
              routeHalf column; clipped to "Например, Алм…". t('city') is
              short and reads naturally under the "Откуда" label above. */}
          <Text style={[styles.routeValue, { color: palette.text }, !dirFrom && { color: palette.textMuted }]} numberOfLines={1}>
            {dirFrom ? localizePlace(dirFrom, lang) : t('city')}
          </Text>
        </TouchableOpacity>
        <Feather name="arrow-right" size={24} color={ACCENT} />
        <TouchableOpacity style={styles.routeHalf} onPress={() => setShowDirToPicker(true)} testID="feed-route-to">
          <View style={styles.routeLabelRow}>
            <Feather name="flag" size={14} color={palette.textMuted} />
            <Text style={[styles.routeLabel, { color: palette.textSecondary }]}>{t('to')}</Text>
          </View>
          <Text style={[styles.routeValue, { color: palette.text }, !dirTo && { color: palette.textMuted }]} numberOfLines={1}>
            {dirTo ? localizePlace(dirTo, lang) : t('city')}
          </Text>
        </TouchableOpacity>
        {(dirFrom || dirTo) ? (
          <TouchableOpacity onPress={() => { setDirFrom(''); setDirTo(''); }} hitSlop={10} testID="feed-route-clear">
            <Feather name="x" size={17} color={palette.textMuted} />
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
        {filterPill('capacity', t('filter_capacity'), 'truck', capacityFilter !== 'all')}
        <CompactFilterChip variant="driver" icon="bookmark" active={savedOnly} onPress={toggleSavedOnly} testID="cargo-filter-favorites" accessibilityLabel={copy.favorites} />
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.pageBg }]} edges={['top']} testID="cargo-screen">
      <DriverRouteBackdrop />
      <RootHeader ceramic navigation={navigation} role={role} title={t('tab_feed')} testID="cargo-feed-minimal-header" bellTestID="cargo-feed-notification-settings-btn" menuTestID="feed-menu-btn" onBellPress={async () => {
            const ok = await requireLevel(LEVELS.PHONE, 'push_settings', role);
            if (ok) navigation.navigate('PushFilter', { role });
          }} />

      <FlatList
        style={styles.list}
        data={loading ? [] : visibleItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <CargoCard
            item={item}
            lang={lang}
            t={t}
            copy={copy}
            saved={savedIds.has(String(item.id))}
            onToggleSaved={() => toggleSaved(item)}
            onPress={() => openCargo(item)}
          />
        )}
        ListHeaderComponent={feedControls}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loading && !savedOnly && items.length >= pageLimit) setPageLimit((p) => p + 50);
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              {[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Feather name={error ? 'alert-circle' : savedOnly ? 'bookmark' : 'package'} size={32} color={palette.textMuted} />
              <Text style={[styles.emptyTitle, { color: palette.textMuted }]}>{error ? copy.loadError : copy.empty}</Text>
              {error ? (
                <TouchableOpacity style={[styles.retryBtn, { backgroundColor: palette.accentSoft }]} onPress={load} testID="cargo-retry">
                  <Text style={[styles.retryText, { color: palette.accent }]}>{copy.retry}</Text>
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
        onSelect={(value, point) => setDirFrom((point && point.name) || value || '')}
      />
      <LocationPickerModal
        visible={showDirToPicker}
        onClose={() => setShowDirToPicker(false)}
        title={t('loc_to_title')}
        onSelect={(value, point) => setDirTo((point && point.name) || value || '')}
      />

      {/* P1 (27.08.2026, владелец): sheetSecondary/bodyChip/sortRow — все три
          были static StyleSheet.create с захардкоженным SURFACE/BORDER
          (#FFFFFF/#E5EAE7), без inline theme-override — единственные три
          элемента в bottom-sheet'ах, которые "make cargo feed follow theme"
          (c0796ae) пропустил (BottomSheet сам по себе theme-aware — см.
          components/ui/v1/BottomSheet.js — но эти внутренние кнопки/чипы
          рисовались поверх него белыми в любой теме). Инлайн-оверрайд по
          тому же паттерну, что уже используется в файле (styles.price,
          styles.routeValue) — palette.surface/palette.border/
          palette.textSecondary/palette.text уже посчитаны через
          cargoPalette(theme, isDark) выше. */}
      <BottomSheet visible={activeFilter === 'date'} onClose={() => setActiveFilter(null)} title={t('filter_date')}>
        <Text style={[styles.sheetLabel, { color: palette.textMuted }]}>{t('filter_date_from')}</Text>
        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={t('date_placeholder')} />
        <Text style={[styles.sheetLabel, { color: palette.textMuted, marginTop: 14 }]}>{t('filter_date_to')}</Text>
        <DatePicker value={dateTo} onChange={setDateTo} placeholder={t('date_placeholder')} />
        <View style={styles.sheetActions}>
          <TouchableOpacity style={[styles.sheetSecondary, { backgroundColor: palette.surface, borderColor: palette.border }]} onPress={() => { setDateFrom(''); setDateTo(''); }}>
            <Text style={[styles.sheetSecondaryText, { color: palette.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeFilter === 'body'} onClose={() => setActiveFilter(null)} title={t('filter_body')}>
        <View style={styles.bodyGrid}>
          <TouchableOpacity
            style={[styles.bodyChip, { backgroundColor: palette.surface, borderColor: palette.border }, !filterType && { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[styles.bodyChipText, { color: palette.textSecondary }, !filterType && styles.bodyChipTextActive]}>{t('filter_all')}</Text>
          </TouchableOpacity>
          {TRUCK_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.bodyChip, { backgroundColor: palette.surface, borderColor: palette.border }, filterType === key && { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}
              onPress={() => setFilterType(filterType === key ? null : key)}
            >
              <Text style={[styles.bodyChipText, { color: palette.textSecondary }, filterType === key && styles.bodyChipTextActive]}>{formatTruckType(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sheetActions}>
          <TouchableOpacity style={[styles.sheetSecondary, { backgroundColor: palette.surface, borderColor: palette.border }]} onPress={() => setFilterType(null)}>
            <Text style={[styles.sheetSecondaryText, { color: palette.textSecondary }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => setActiveFilter(null)}>
            <Text style={styles.sheetPrimaryText}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={activeFilter === 'capacity'} onClose={() => setActiveFilter(null)} title={t('filter_capacity')}>
        {[
          ['all', t('capacity_all')],
          ['light', t('capacity_light')],
          ['medium', t('capacity_medium')],
          ['heavy', t('capacity_heavy')],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.sortRow, { backgroundColor: palette.surface, borderColor: palette.border }, capacityFilter === key && { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}
            onPress={() => setCapacityFilter(key)}
          >
            <Text style={[styles.sortText, { color: palette.textSecondary }, capacityFilter === key && styles.sortTextActive]}>{label}</Text>
            {capacityFilter === key ? <Feather name="check" size={18} color={ACCENT} /> : null}
          </TouchableOpacity>
        ))}
        <View style={styles.sheetActions}>
          <TouchableOpacity style={[styles.sheetSecondary, { backgroundColor: palette.surface, borderColor: palette.border }]} onPress={() => setCapacityFilter('all')}>
            <Text style={[styles.sheetSecondaryText, { color: palette.textSecondary }]}>{t('filter_reset')}</Text>
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
    minHeight: 48,
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
    minHeight: 60,
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
  routeSelectorActive: { borderColor: ACCENT },
  routeHalf: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  routeLabel: { fontSize: 11.5, lineHeight: 15, fontWeight: '600', color: TEXT_SECONDARY },
  routeValue: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: TEXT },
  placeholder: { color: '#727D77' },
  filtersScroll: { flexGrow: 0, minHeight: 44, maxHeight: 44 },
  filters: { paddingHorizontal: 18, paddingVertical: 3, gap: 6, alignItems: 'center' },
  filterPill: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#14211C',
    shadowOpacity: 0.025,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterPillText: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY },
  filterPillTextActive: { color: ACCENT },
  favoritesPill: { borderColor: '#CAE2D7', backgroundColor: '#F5FBF8' },
  favoritesPillActive: { borderColor: '#A6D2BE', backgroundColor: ACCENT_SOFT },
  favoritesText: { color: ACCENT },
  favoritesCount: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#6B8C7C' },
  list: { flex: 1 },
  listContent: { paddingTop: 0, paddingBottom: 28 },
  loadingWrap: { paddingHorizontal: 24, paddingTop: 5 },
  // Design v1 Commit 3: the card itself is the canonical MarketplaceCard
  // (radius 16, border, no shadow, no green rail) — the screen only keeps
  // its list spacing.
  cardSpacing: { marginHorizontal: 18, marginBottom: 5 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 65, gap: 11 },
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
  bodyChipText: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: '600' },
  bodyChipTextActive: { color: ACCENT },
  sortRow: { minHeight: 50, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE },
  sortText: { fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY },
  sortTextActive: { color: ACCENT },
});
