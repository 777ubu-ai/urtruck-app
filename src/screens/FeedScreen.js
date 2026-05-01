import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Platform, ScrollView, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { formatBids, formatStatus, formatTruckType, t as tGlobal } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { getCargos, addCargo, addTrip, getTrips, subscribe, getUnreadNotifications, isFavorite, toggleFavorite } from '../utils/store';
import { marketAPI } from '../utils/marketAPI';
import DatePicker from '../components/DatePicker';
import CityInput from '../components/CityInput';
import CargoTypeInput from '../components/CargoTypeInput';
import { PhotoPicker } from '../components/PhotoGallery';
import GradientText from '../components/GradientText';
import ShimmerButton from '../components/ShimmerButton';
import { useToast } from '../components/Toast';
import { routeStats } from '../utils/geo';
import SecurityBadge from '../components/SecurityBadge';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import { SkeletonCard } from '../components/Skeleton';
import { IS_BETA } from '../config/supabase';

const TCOLORS = {
  tent: '#2563EB', ref: '#0891B2', platform: '#D97706', auto: '#7C3AED', izoterm: '#059669',
  cont20: '#6366F1', cont40: '#4338CA', jumbo: '#EC4899', mega: '#DB2777',
  curtain: '#8B5CF6', lowloader: '#F97316', tanker: '#10B981', dumptruck: '#EAB308',
  grain: '#CA8A04', livestock: '#84CC16', logger: '#65A30D', hazmat: '#DC2626',
  open_truck: '#0EA5E9', closed: '#0284C7', longliner: '#7C3AED', microvan: '#64748B',
};
const TRUCK_KEYS = ['tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40', 'jumbo', 'mega', 'curtain', 'lowloader', 'tanker', 'dumptruck', 'grain', 'livestock', 'logger', 'hazmat', 'open_truck', 'closed', 'longliner', 'microvan'];
const TRUCK_ICONS = {
  tent: '🚚', ref: '🧊', platform: '🛻', auto: '🚗', izoterm: '❄️',
  cont20: '📦', cont40: '📦', jumbo: '🚛', mega: '🚛',
  curtain: '🚛', lowloader: '🏗️', tanker: '🛢️', dumptruck: '🚜',
  grain: '🌾', livestock: '🐄', logger: '🪵', hazmat: '☢️',
  open_truck: '🚚', closed: '🚐', longliner: '🚛', microvan: '🚐',
};
const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳', TJ: '🇹🇯', TR: '🇹🇷', TM: '🇹🇲', MN: '🇲🇳', DE: '🇩🇪', FR: '🇫🇷' };

// HOT-003: фильтр технического мусора из БД (остатки парсеров, init_db, стектрейсы)
const TRASH_PATTERNS = /init_db|phone_formatter|json_merger|bin_iin|SQL|sqlite|traceback|\bError:|File "[^"]+\.py"|line \d+|^```|stderr|\.py\b|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/gi;
const sanitizeDesc = (s) => {
  if (!s) return tGlobal('desc_not_specified');
  const cleaned = String(s)
    .replace(TRASH_PATTERNS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : tGlobal('desc_not_specified');
};

const DRIVERS = [
  { id: 'd1', name: 'Ержан К.', country: 'KZ', type: 'tent', m3: 120, tons: 22, rating: 4.8, reviews: 47, verified: true },
  { id: 'd2', name: 'Бахтиёр У.', country: 'UZ', type: 'ref', m3: 82, tons: 20, rating: 4.9, reviews: 112, verified: true },
  { id: 'd3', name: 'Алексей П.', country: 'RU', type: 'platform', m3: 160, tons: 25, rating: 4.5, reviews: 23, verified: false },
  { id: 'd4', name: 'Азамат Т.', country: 'KZ', type: 'cont40', m3: 110, tons: 20, rating: 4.7, reviews: 31, verified: true },
  { id: 'd5', name: 'Ван Лей', country: 'CN', type: 'izoterm', m3: 70, tons: 18, rating: 4.6, reviews: 8, verified: true },
  { id: 'd6', name: 'Марат А.', country: 'KG', type: 'tanker', m3: 40, tons: 25, rating: 4.9, reviews: 65, verified: true },
];

export default function FeedScreen({ navigation, route }) {
  const { role } = route.params || { role: 'client' };
  const isDriver = role === 'driver';
  const accent = isDriver ? '#2563EB' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const { session } = useAuth();
  const myUserId = session?.user?.id;
  const listRef = React.useRef(null);
  const [, setTick] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [minRating, setMinRating] = useState(0); // 0 = все, 4 = 4★+, 5 = только 5★
  const [initialLoading, setInitialLoading] = useState(true);
  const [serverData, setServerData] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Загрузка данных С СЕРВЕРА (главное изменение!)
  const loadFromServer = async () => {
    setLoadError(false);
    try {
      if (isDriver) {
        const { cargos } = await marketAPI.listCargos({ cargoType: filterType || '' });
        const mapped = (cargos || []).map(c => ({
          id: c.id, from: c.from_city, to: c.to_city,
          cargo: c.cargo_desc, type: c.cargo_type,
          tons: c.weight_tons, m3: c.volume_m3,
          price: c.price, pickup: c.pickup_date,
          bids: c.bids_count, photos: c.photos,
          photo: c.photos?.[0], isMine: c.owner_id === myUserId,
          createdAt: c.created_at, _server: true,
        }));
        setServerData(mapped);
      } else {
        // Клиент видит: свои грузы + рейсы + водители
        const [tripsRes, driversRes, myRes] = await Promise.all([
          marketAPI.listTrips({ truckType: filterType || '' }),
          marketAPI.listDrivers({ truckType: filterType || '' }),
          marketAPI.myDashboard().catch(() => ({ my_cargos: [] })),
        ]);
        // Мои грузы — в начале ленты
        const myCargos = ((myRes || {}).my_cargos || []).map(c => ({
          id: c.id, from: c.from_city, to: c.to_city,
          cargo: c.cargo_desc, type: c.cargo_type,
          tons: c.weight_tons, m3: c.volume_m3,
          price: c.price, pickup: c.pickup_date,
          bids: c.bids_count, photos: c.photos,
          photo: (c.photos || [])[0], isMine: true,
          createdAt: c.created_at, _server: true,
        }));
        const tripsMapped = ((tripsRes || {}).trips || []).map(t => ({
          id: t.id, name: t.driver_name || tGlobal('driver_fallback'),
          country: 'KZ', type: t.truck_type || 'tent',
          m3: t.available_m3 || 82, tons: t.capacity_tons || 20,
          rating: 5.0, reviews: 0, verified: true,
          from: t.from_city, to: t.to_city,
          price: t.price,
          isTrip: true,
          tripRoute: `${t.from_city} → ${t.to_city}`,
          tripDates: t.departure && t.arrival ? `${t.departure} - ${t.arrival}` : '',
          _server: true,
        }));
        const driversMapped = ((driversRes || {}).drivers || []).map(d => ({
          id: d.id, name: d.full_name || tGlobal('driver_fallback'),
          country: 'KZ', type: d.vehicle_type || 'tent',
          m3: Math.round((d.vehicle_capacity_kg || 20000) / 250),
          tons: Math.round((d.vehicle_capacity_kg || 20000) / 1000),
          rating: d.rating || 0, reviews: d.reviews_count || 0,
          verified: true,
          plate_truck: d.vehicle_plate,
          phone: '***',
          _server: true, _isDriver: true,
        }));
        setServerData([...myCargos, ...tripsMapped, ...driversMapped]);
      }
    } catch (e) {
      console.warn('[Feed] Server load failed:', e);
      setLoadError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { loadFromServer(); }, [isDriver, filterType]);

  // Серверный поиск при вводе маршрута "Алматы→Москва"
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.includes('→') || search.includes('->')) {
        const sep = search.includes('→') ? '→' : '->';
        const [from, to] = search.split(sep).map(s => s.trim());
        if (from && to) {
          if (isDriver) {
            marketAPI.listCargos({ fromCity: from, toCity: to }).then(d => {
              if (d.cargos?.length) {
                setServerData(d.cargos.map(c => ({
                  id: c.id, from: c.from_city, to: c.to_city,
                  cargo: c.cargo_desc, type: c.cargo_type,
                  tons: c.weight_tons, m3: c.volume_m3,
                  price: c.price, bids: c.bids_count,
                  photos: c.photos, photo: c.photos?.[0],
                  _server: true, createdAt: c.created_at,
                })));
              }
            }).catch(() => {});
          } else {
            marketAPI.listTrips({ fromCity: from, toCity: to }).then(d => {
              if (d.trips?.length) {
                setServerData(prev => {
                  const existing = prev.filter(p => !d.trips.find(t => t.id === p.id));
                  return [...d.trips.map(t => ({
                    id: t.id, name: t.driver_name || tGlobal('driver_fallback'),
                    type: t.truck_type, from: t.from_city, to: t.to_city,
                    price: t.price, isTrip: true, _server: true,
                    tripRoute: `${t.from_city} → ${t.to_city}`,
                  })), ...existing];
                });
              }
            }).catch(() => {});
          }
        }
      }
    }, 500); // debounce 500ms
    return () => clearTimeout(timer);
  }, [search, isDriver]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadFromServer().finally(() => {
      setRefreshing(false);
      toast('🔄 Обновлено', 'info', 1500);
    });
  }, [isDriver]);

  useEffect(() => {
    const unsub = subscribe(() => setTick(x => x + 1));
    return () => unsub();
  }, []);

  // Данные: серверные + локальные (для обратной совместимости)
  const localData = isDriver ? getCargos() : DRIVERS;
  const currentData = [...serverData, ...localData.filter(l => !serverData.find(s => s.id === l.id))];
  const filteredData = useMemo(() => {
    let data = [...currentData];
    if (filterType) data = data.filter(d => d.type === filterType);
    if (minRating > 0) {
      data = data.filter(d => (d.rating || 0) >= minRating);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(d => (
        (d.from && d.from.toLowerCase().includes(q)) ||
        (d.to && d.to.toLowerCase().includes(q)) ||
        (d.cargo && d.cargo.toLowerCase().includes(q)) ||
        (d.name && d.name.toLowerCase().includes(q))
      ));
    }
    // Сортировка
    if (sortBy === 'price-asc') data.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sortBy === 'price-desc') data.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sortBy === 'rating') data.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    // 'newest' — по умолчанию (как в массиве)
    return data;
  }, [currentData, filterType, search, sortBy, minRating]);

  // Cargo form
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [cargoDesc, setCargoDesc] = useState('');
  const [weight, setWeight] = useState('');
  const [vol, setVol] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [truckType, setTruckType] = useState('tent');
  const [pickupDate, setPickupDate] = useState('');
  const [cargoPhotos, setCargoPhotos] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Trip form
  const [tripFrom, setTripFrom] = useState('');
  const [tripTo, setTripTo] = useState('');
  const [tripTransit, setTripTransit] = useState('');
  const [tripDateFrom, setTripDateFrom] = useState('');
  const [tripDateTo, setTripDateTo] = useState('');

  const showOk = (msg, type = 'success', dur = 3000) => toast(msg, type, dur);

  // HOT-008: inline-валидация с красной подсветкой
  const validateCargoForm = () => {
    const errors = {};
    if (!fromCity) errors.fromCity = 'Укажите город отправления';
    if (!toCity) errors.toCity = 'Укажите город назначения';
    if (!cargoDesc) errors.cargoDesc = 'Опишите груз';
    if (price && parseFloat(price) <= 0) errors.price = t('val_price_positive');
    if (weight && parseFloat(weight) <= 0) errors.weight = 'Вес должен быть больше 0';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitCargo = async () => {
    if (submitting) return;
    if (!validateCargoForm()) {
      showOk('Заполните обязательные поля', 'error', 4000);
      return;
    }
    setSubmitting(true);
    try {
      const r = await marketAPI.createCargo({
        from_city: fromCity, to_city: toCity, cargo_desc: cargoDesc,
        cargo_type: truckType,
        weight_tons: parseInt(weight) || 0, volume_m3: parseInt(vol) || 0,
        price: parseInt(price) || 0, currency,
        pickup_date: pickupDate || null,
        photos: cargoPhotos,
      });
      if (r.ok) {
        showOk('✓ Груз опубликован и виден всем водителям', 'success', 4000);
        setShowForm(false);
        setFromCity(''); setToCity(''); setCargoDesc(''); setWeight(''); setVol('');
        setPrice(''); setPickupDate(''); setCargoPhotos([]); setFormErrors({});
        await loadFromServer();
        setTimeout(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }), 300);
      } else {
        showOk(r.status === 401 ? 'Сессия истекла. Войдите заново.' : (r.detail || t('generic_error')), 'error');
      }
    } catch (e) {
      console.error('[submitCargo] failed:', e);
      const msg = (e.message || '').includes('pattern') ? 'Проверьте заполненные поля' : t('network_error');
      showOk(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitTrip = async () => {
    if (submitting) return;
    const tripErrors = [];
    if (!tripFrom) tripErrors.push('Укажите город отправления');
    if (!tripTo) tripErrors.push('Укажите город назначения');
    if (!tripDateFrom) tripErrors.push('Укажите дату выезда');
    if (tripErrors.length > 0) { showOk(tripErrors[0], 'error', 4000); return; }
    setSubmitting(true);
    try {
      const tripPayload = {
        from_city: tripFrom, to_city: tripTo, transit: tripTransit,
        truck_type: truckType || 'tent',
        capacity_tons: Number(weight) || 20,
        available_m3: Number(vol) || 82,
        price: Number(price) || 0,
        departure: tripDateFrom || null,
        arrival: tripDateTo || null,
      };
      const r = await marketAPI.createTrip(tripPayload);
      if (r.ok) {
        showOk('✓ Маршрут опубликован', 'success', 4000);
        setShowForm(false);
        setTripFrom(''); setTripTo(''); setTripTransit(''); setTripDateFrom(''); setTripDateTo('');
        // Navigate with justCreated so MyTrips shows it even if /my fails
        const justCreated = { id: r.id, ...tripPayload, status: 'active', created_at: new Date().toISOString() };
        setTimeout(() => navigation.navigate('MyTripsList', { role, initialTab: 'my', justCreatedTrip: justCreated }), 1000);
      } else {
        showOk(r.detail || t('send_error'), 'error');
      }
    } catch (e) {
      showOk(t('network_error') + ': ' + (e.message || ''), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCargo = ({ item }) => {
    const stats = routeStats(item.from, item.to);
    const fav = isFavorite(item.id);
    const rawPhoto = (item.photos && item.photos[0]) || item.photo;
    const photo = rawPhoto && typeof rawPhoto === 'string' && !rawPhoto.startsWith('data:') && rawPhoto.length < 1000 ? rawPhoto : null;
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: theme.card, borderColor: item.isMine ? '#F59E0B60' : theme.border, borderWidth: item.isMine ? 2 : 1 }]}
        onPress={async () => {
          const ok = await requireLevel(LEVELS.PHONE, 'open_detail');
          if (ok) {
            // Strip heavy base64 photos from navigation params to avoid crash
            const safePhotos = (item.photos || []).filter(p => typeof p === 'string' && p.length < 500);
            navigation.navigate('CargoDetail', { cargo: { ...item, photos: safePhotos, photo: null }, cargoId: item.id, role });
          }
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          {item.isMine ? (
            <View style={[s.mineBadge, { backgroundColor: '#F59E0B' }]}><Text style={s.mineBadgeText}>{t('badge_cargo')}</Text></View>
          ) : (
            <View style={[s.mineBadge, { backgroundColor: '#263244' }]}><Text style={[s.mineBadgeText, { color: '#94A3B8' }]}>{t('badge_cargo')}</Text></View>
          )}
          <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '600' }}>{formatStatus(item.status || 'active')}</Text>
        </View>
        <View style={s.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.route, { color: theme.text }]}>{item.from} → {item.to}</Text>
            <Text style={[s.cargoName, { color: theme.textSecondary }]} numberOfLines={2} ellipsizeMode="tail">{sanitizeDesc(item.cargo)}</Text>
            <View style={s.badges}>
              <Text style={[s.badge, { color: TCOLORS[item.type] || '#666', backgroundColor: (TCOLORS[item.type] || '#666') + '15' }]}>{formatTruckType(item.type)}</Text>
              {(item.tons > 0 || item.m3 > 0) && <Text style={[s.badge, { color: theme.textSecondary, backgroundColor: theme.border }]}>{item.tons > 0 ? item.tons + 'т' : ''}{item.tons > 0 && item.m3 > 0 ? ' · ' : ''}{item.m3 > 0 ? item.m3 + 'м³' : ''}</Text>}
              {stats && <Text style={[s.badge, { color: theme.text, backgroundColor: theme.border }]}>{stats.km}км · ~{stats.days}дн</Text>}
              {item.pickup && <Text style={[s.badge, { color: theme.textMuted, backgroundColor: theme.border }]}>📅 {item.pickup}</Text>}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0, maxWidth: 100 }}>
            <Text style={s.price}>{item.price > 0 ? `$${item.price}` : t('negotiable')}</Text>
            <Text style={[s.bidsCount, { color: theme.textMuted }]}>{formatBids(item.bids)}</Text>
            <Text style={{ color: '#22C55E', fontSize: 11, fontWeight: '700', marginTop: 4 }}>{item.isMine ? t('details') + ' →' : isDriver ? t('respond') + ' →' : t('details') + ' →'}</Text>
          </View>
        </View>
        {photo && <Image source={{ uri: photo }} style={s.cargoPreview} />}
      </TouchableOpacity>
    );
  };

  const renderDriver = ({ item }) => (
    <TouchableOpacity
      style={[s.card, { backgroundColor: theme.card, borderColor: item.isTrip ? '#22C55E60' : theme.border, borderWidth: item.isTrip ? 2 : 1 }]}
      onPress={async () => {
        const ok = await requireLevel(LEVELS.PHONE, 'open_detail');
        if (!ok) return;
        if (item.isTrip) {
          navigation.navigate('TripDetail', {
            trip: { ...item, from_city: item.from || item.from_city || '—', to_city: item.to || item.to_city || '—', truck_type: item.type || item.truck_type || 'tent', price: item.price || 0 },
            role,
          });
        } else {
          navigation.navigate('DriverDetail', {
            driver: { ...item, name: item.name || item.full_name || tGlobal('driver_fallback'), type: item.type || item.vehicle_type || 'tent', m3: item.m3 || 0, tons: item.tons || 0, rating: item.rating || 0, reviews: item.reviews || 0 },
            role,
          });
        }
      }}
    >
      <View style={[s.tripBadge, { backgroundColor: item.isTrip ? '#172033' : '#263244' }]}>
        <Text style={[s.tripBadgeText, { color: item.isTrip ? '#3B82F6' : '#94A3B8' }]}>{t('badge_trip')}</Text>
      </View>
      <View style={s.cardRow}>
        <Text style={{ fontSize: 28, marginRight: 12 }}>{FLAGS[item.country] || '🏳️'}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[s.driverName, { color: theme.text }]}>{item.name} {item.verified && '✓'}</Text>
            <SecurityBadge userId={item.id} compact />
          </View>
          {item.isTrip && item.tripRoute ? (
            <>
              <Text style={[s.tripRoute, { color: '#22C55E' }]}>📍 {item.tripRoute}</Text>
              {item.tripDates ? <Text style={[s.tripDates, { color: theme.textMuted }]}>📅 {item.tripDates}</Text> : null}
            </>
          ) : (
            <Text style={s.rating}>★ {item.rating} ({item.reviews})</Text>
          )}
          <View style={s.badges}>
            <Text style={[s.badge, { color: TCOLORS[item.type] || '#666', backgroundColor: (TCOLORS[item.type] || '#666') + '15' }]}>{formatTruckType(item.type)}</Text>
            {(item.m3 > 0 || item.tons > 0) && <Text style={[s.badge, { color: theme.textSecondary, backgroundColor: theme.border }]}>{item.tons > 0 ? item.tons + ' т' : ''}{item.tons > 0 && item.m3 > 0 ? ' · ' : ''}{item.m3 > 0 ? item.m3 + ' м³' : ''}</Text>}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <GradientText style={s.title} colors={isDriver ? ['#2563EB', '#7C3AED'] : ['#F59E0B', '#EF4444']}>
            {isDriver ? t('cargos') : t('trucks')}
          </GradientText>
          <Text style={[s.subtitle, { color: theme.textMuted }]}>{filteredData.length} {isDriver ? t('active_cargos') : t('available_trips')}</Text>
        </View>
        <TouchableOpacity
          style={[s.bellBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Text style={{ fontSize: 18 }}>🔔</Text>
          {/* Badge disabled — only show when real server notifications integrated */}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: accent }]}
          onPress={() => setShowForm(true)}
          testID={isDriver ? 'publish-trip-button' : 'publish-cargo-button'}
          accessibilityRole="button"
          accessibilityLabel={isDriver ? 'Опубликовать маршрут' : 'Разместить груз'}
        >
          <Text style={[s.actionBtnText, { color: isDriver ? '#fff' : '#0C0A09' }]}>{isDriver ? t('postTrip') : t('postCargo')}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={[s.searchInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder={'🔍 ' + t('searchRoute')}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {(filterType || search || sortBy !== 'newest' || minRating > 0) && (
          <TouchableOpacity style={s.clearBtn} onPress={() => { setFilterType(null); setSearch(''); setSortBy('newest'); setMinRating(0); }}>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.filterBtn, { backgroundColor: (filterType || minRating > 0 || sortBy !== 'newest') ? accent : theme.card, borderColor: theme.border }]}
          onPress={() => setFilterOpen(true)}
        >
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
        {search.includes('→') && (
          <TouchableOpacity
            style={[s.saveRouteBtn, { borderColor: accent }]}
            onPress={async () => {
              const parts = search.split('→').map(s => s.trim());
              if (parts.length === 2 && parts[0] && parts[1]) {
                const ok = await requireLevel(LEVELS.PHONE, 'default');
                if (ok) {
                  toast(`🔖 Маршрут ${parts[0]}→${parts[1]} сохранён`, 'success');
                }
              }
            }}
          >
            <Text style={{ color: accent, fontSize: 11, fontWeight: '700' }}>🔖 Сохранить</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Чипы выбранных фильтров */}
      {(filterType || minRating > 0 || sortBy !== 'newest') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.activeChipsRow}>
          {filterType && (
            <View style={[s.activeChip, { backgroundColor: TCOLORS[filterType] || accent }]}>
              <Text style={s.activeChipText}>{TRUCK_ICONS[filterType]} {t(filterType)}</Text>
              <TouchableOpacity onPress={() => setFilterType(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.activeChipClose}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {minRating > 0 && (
            <View style={[s.activeChip, { backgroundColor: '#FBBF24' }]}>
              <Text style={[s.activeChipText, { color: '#0C0A09' }]}>⭐ {minRating}+</Text>
              <TouchableOpacity onPress={() => setMinRating(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.activeChipClose, { color: '#0C0A09' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {sortBy !== 'newest' && (
            <View style={[s.activeChip, { backgroundColor: sortBy === 'rating' ? '#FBBF24' : '#22C55E' }]}>
              <Text style={[s.activeChipText, { color: sortBy === 'rating' ? '#0C0A09' : '#fff' }]}>
                {sortBy === 'price-asc' ? '💰 ' + t('filter_price_asc') : sortBy === 'price-desc' ? '💰 ' + t('filter_price_desc') : '★ ' + t('filter_rating_sort')}
              </Text>
              <TouchableOpacity onPress={() => setSortBy('newest')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.activeChipClose, { color: sortBy === 'rating' ? '#0C0A09' : '#fff' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal фильтров — bottom sheet */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setFilterOpen(false)}>
          <TouchableOpacity style={[s.filterSheet, { backgroundColor: theme.cardElevated || theme.card }]} activeOpacity={1} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.handle} />
              <Text style={[s.filterSheetTitle, { color: theme.text }]}>⚙️ {t('filter_title')}</Text>

              {/* Секция Рейтинг */}
              {!isDriver && (
                <>
                  <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('filter_rating')}</Text>
                  <View style={s.filterPillRow}>
                    {[{ k: 0, l: t('filter_all') }, { k: 3, l: '3+' }, { k: 4, l: '4+' }, { k: 5, l: '5' }].map(opt => (
                      <TouchableOpacity
                        key={opt.k}
                        style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, minRating === opt.k && { backgroundColor: '#FBBF24', borderColor: '#FBBF24' }]}
                        onPress={() => setMinRating(opt.k)}
                      >
                        <Text style={[s.filterPillText, { color: theme.textSecondary }, minRating === opt.k && { color: '#0C0A09' }]}>
                          {opt.k > 0 ? `⭐ ${opt.l}` : opt.l}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Секция Тип кузова */}
              <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('filter_truck_type')}</Text>
              <View style={s.filterPillWrap}>
                <TouchableOpacity
                  style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, !filterType && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => setFilterType(null)}
                >
                  <Text style={[s.filterPillText, { color: theme.textSecondary }, !filterType && { color: isDriver ? '#fff' : '#0C0A09' }]}>{t('filter_all')}</Text>
                </TouchableOpacity>
                {TRUCK_KEYS.map(k => (
                  <TouchableOpacity
                    key={k}
                    style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, filterType === k && { backgroundColor: TCOLORS[k], borderColor: TCOLORS[k] }]}
                    onPress={() => setFilterType(filterType === k ? null : k)}
                  >
                    <Text style={[s.filterPillText, { color: theme.textSecondary }, filterType === k && { color: '#fff' }]}>
                      {TRUCK_ICONS[k]} {t(k)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Секция Сортировка */}
              <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('filter_sort')}</Text>
              <View style={s.filterPillRow}>
                {[
                  { k: 'newest', l: '🆕 ' + t('filter_newest') },
                  { k: 'price-asc', l: '💰 ' + t('filter_price_asc') },
                  { k: 'price-desc', l: '💰 ' + t('filter_price_desc') },
                  { k: 'rating', l: '★ ' + t('filter_rating_sort') },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.k}
                    style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, sortBy === opt.k && { backgroundColor: accent, borderColor: accent }]}
                    onPress={() => setSortBy(opt.k)}
                  >
                    <Text style={[s.filterPillText, { color: theme.textSecondary }, sortBy === opt.k && { color: isDriver ? '#fff' : '#0C0A09' }]}>{opt.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Кнопки Сбросить / Применить */}
              <View style={s.filterActions}>
                <TouchableOpacity
                  style={[s.filterActionBtn, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
                  onPress={() => { setFilterType(null); setMinRating(0); setSortBy('newest'); }}
                >
                  <Text style={[s.filterActionText, { color: theme.textSecondary }]}>{t('filter_reset')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.filterActionBtn, { backgroundColor: accent }]}
                  onPress={() => setFilterOpen(false)}
                >
                  <Text style={[s.filterActionText, { color: isDriver ? '#fff' : '#0C0A09' }]}>{t('filter_apply')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {initialLoading ? (
        <View style={{ padding: 16 }}>
          {[0,1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredData}
          keyExtractor={i => i.id}
          renderItem={isDriver ? renderCargo : renderDriver}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: 10 }}>{loadError ? '⚠️' : '🔍'}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
                {loadError ? 'Не удалось загрузить. Проверьте интернет.' :
                 minRating > 0 ? `Нет ${minRating}★+ результатов.` :
                 filterType ? 'По фильтру ничего не найдено.' :
                 t('no_active_cargos')}
              </Text>
              {loadError && (
                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: '#22C55E', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                  onPress={() => { setRefreshing(true); loadFromServer().finally(() => setRefreshing(false)); }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Обновить</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: theme.bg, borderColor: theme.border, maxHeight: '92%' }]} activeOpacity={1} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.handle} />
              <Text style={[s.formTitle, { color: theme.text }]}>{isDriver ? '🚛 ' + t('postTrip') : '📦 ' + t('postCargo')}</Text>

              {isDriver ? (
                <>
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>{t('tripRoute')}</Text>
                  <View style={{ zIndex: 200, marginBottom: 4 }}>
                    <CityInput value={tripFrom} onChange={setTripFrom} placeholder={'📍 ' + t('fromCountry')} testID="trip-from-input" />
                  </View>
                  <View style={{ zIndex: 100, marginBottom: 4 }}>
                    <CityInput value={tripTo} onChange={setTripTo} placeholder={'🏁 ' + t('toCountry')} testID="trip-to-input" />
                  </View>
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>{t('transit')}</Text>
                  <View style={{ zIndex: 150, marginBottom: 4 }}>
                    <CityInput value={tripTransit} onChange={setTripTransit} placeholder={'🔄 ' + t('transitOptional')} testID="trip-transit-input" />
                  </View>
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>{t('departure')} · {t('arrival')}</Text>
                  <View style={s.frow}>
                    <View style={{ flex: 1 }}>
                      <DatePicker value={tripDateFrom} onChange={setTripDateFrom} placeholder={t('departure')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <DatePicker value={tripDateTo} onChange={setTripDateTo} placeholder={t('arrival')} />
                    </View>
                  </View>
                  <View style={s.hintBox}><Text style={[s.hintText, { color: theme.textMuted }]}>💡 {t('youPublish')}</Text></View>
                  <TouchableOpacity
                    onPress={submitTrip}
                    style={{ backgroundColor: submitting ? '#374151' : '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, opacity: submitting ? 0.7 : 1 }}
                    disabled={submitting}
                    activeOpacity={0.8}
                    testID="trip-submit-button"
                    accessibilityRole="button"
                    accessibilityLabel="Опубликовать маршрут"
                  >
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('postTrip')}</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>{t('tripRoute')} *</Text>
                  <View style={{ zIndex: 200, marginBottom: 4 }}>
                    <CityInput
                      value={fromCity}
                      onChange={(v) => { setFromCity(v); if (formErrors.fromCity) setFormErrors(e => ({ ...e, fromCity: null })); }}
                      placeholder={'📍 ' + t('fromCountry')} testID="cargo-from-input"
                    />
                    {formErrors.fromCity && <Text style={s.fieldError}>⚠️ {formErrors.fromCity}</Text>}
                  </View>
                  <View style={{ zIndex: 100, marginBottom: 4 }}>
                    <CityInput
                      value={toCity}
                      onChange={(v) => { setToCity(v); if (formErrors.toCity) setFormErrors(e => ({ ...e, toCity: null })); }}
                      placeholder={'🏁 ' + t('toCountry')} testID="cargo-to-input"
                    />
                    {formErrors.toCity && <Text style={s.fieldError}>⚠️ {formErrors.toCity}</Text>}
                  </View>
                  <View style={{ zIndex: 80 }}>
                    <CargoTypeInput
                      value={cargoDesc}
                      onChange={(v) => { setCargoDesc(v); if (formErrors.cargoDesc) setFormErrors(e => ({ ...e, cargoDesc: null })); }}
                      placeholder={'📦 ' + t('cargoDesc') + ' *'} testID="cargo-desc-input"
                    />
                    {formErrors.cargoDesc && <Text style={s.fieldError}>⚠️ {formErrors.cargoDesc}</Text>}
                  </View>
                  {/* Быстрые чипы топ-категорий */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
                    {[
                      { n: 'Одежда и текстиль', i: '👕' },
                      { n: 'Электроника', i: '📱' },
                      { n: 'Стройматериалы', i: '🧱' },
                      { n: 'Автозапчасти', i: '🔧' },
                      { n: 'Продукты питания', i: '🍱' },
                      { n: 'Мебель', i: '🛋️' },
                      { n: 'Оптовые товары из Китая', i: '📦' },
                    ].map(c => (
                      <TouchableOpacity
                        key={c.n}
                        style={[s.quickChip, { backgroundColor: theme.card, borderColor: theme.border }, cargoDesc === c.n && { backgroundColor: accent, borderColor: accent }]}
                        onPress={() => setCargoDesc(c.n)}
                      >
                        <Text style={{ fontSize: 14, marginRight: 5 }}>{c.i}</Text>
                        <Text style={[s.quickChipText, { color: theme.textSecondary }, cargoDesc === c.n && { color: isDriver ? '#fff' : '#0C0A09' }]}>{c.n}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {/* HOT-004/HOT2-003: цена + валюта — выделенный блок */}
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>💰 {t('price_label')} *</Text>
                  <View style={s.frow}>
                    <TextInput
                      style={[s.fi, {
                        backgroundColor: theme.card,
                        color: theme.text,
                        borderColor: formErrors.price ? '#EF4444' : theme.border,
                        borderWidth: formErrors.price ? 2 : 1,
                        flex: 2,
                      }]}
                      placeholder="2500"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      value={price}
                      onChangeText={(v) => { setPrice(v); if (formErrors.price) setFormErrors(e => ({ ...e, price: null })); }}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 0, flexGrow: 1 }} style={{ flex: 3, marginBottom: 10 }}>
                      {[
                        { k: 'USD', l: '$' },
                        { k: 'KZT', l: '₸' },
                        { k: 'CNY', l: '¥' },
                        { k: 'RUB', l: '₽' },
                        { k: 'UZS', l: 'сўм' },
                      ].map(c => (
                        <TouchableOpacity
                          key={c.k}
                          style={[s.currChip, { backgroundColor: theme.card, borderColor: theme.border }, currency === c.k && { backgroundColor: accent, borderColor: accent }]}
                          onPress={() => setCurrency(c.k)}
                        >
                          <Text style={[s.currChipText, { color: theme.textSecondary }, currency === c.k && { color: isDriver ? '#fff' : '#0C0A09' }]}>
                            {c.l} {c.k}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  {formErrors.price && <Text style={s.fieldError}>⚠️ {formErrors.price}</Text>}

                  <View style={s.frow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.formLabel, { color: theme.textMuted }]}>⚖️ {t('weight_label')}</Text>
                      <TextInput
                        style={[s.fi, {
                          backgroundColor: theme.card, color: theme.text,
                          borderColor: formErrors.weight ? '#EF4444' : theme.border,
                          borderWidth: formErrors.weight ? 2 : 1,
                        }]}
                        placeholder="20"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="numeric"
                        value={weight}
                        onChangeText={(v) => { setWeight(v); if (formErrors.weight) setFormErrors(e => ({ ...e, weight: null })); }}
                      />
                      {formErrors.weight && <Text style={s.fieldError}>⚠️ {formErrors.weight}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.formLabel, { color: theme.textMuted }]}>📐 {t('volume_label')}</Text>
                      <TextInput
                        style={[s.fi, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                        placeholder="82"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="numeric"
                        value={vol}
                        onChangeText={setVol}
                      />
                    </View>
                  </View>
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>{t('pickupDate')}</Text>
                  <DatePicker value={pickupDate} onChange={setPickupDate} placeholder={t('pickupDate')} />
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>📸 {t('cargoPhoto')} (до 5)</Text>
                  <PhotoPicker photos={cargoPhotos} onChange={setCargoPhotos} />
                  <Text style={[s.formLabel, { color: theme.textMuted }]}>{t('truckType')} ← →</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {TRUCK_KEYS.map(k => (
                      <TouchableOpacity key={k} style={[s.typeCard, { backgroundColor: theme.card, borderColor: theme.border }, truckType === k && { backgroundColor: TCOLORS[k], borderColor: TCOLORS[k] }]} onPress={() => setTruckType(k)}>
                        <Text style={{ fontSize: 22 }}>{TRUCK_ICONS[k]}</Text>
                        <Text style={[s.typeCardText, { color: theme.textSecondary }, truckType === k && { color: '#fff' }]}>{t(k)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={submitCargo}
                    style={{ backgroundColor: submitting ? '#374151' : '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 14, opacity: submitting ? 0.7 : 1 }}
                    disabled={submitting}
                    activeOpacity={0.8}
                    testID="cargo-submit-button"
                    accessibilityRole="button"
                    accessibilityLabel="Разместить груз"
                  >
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('postCargo')}</Text>}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {Gate}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  betaBar: {
    backgroundColor: '#F59E0B',
    paddingVertical: 6, paddingHorizontal: 14,
    alignItems: 'center',
  },
  betaBarText: { color: '#0C0A09', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 8 },
  bellBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, position: 'relative' },
  bellBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#EF4444', minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  title: { fontSize: 22, fontWeight: '900' },
  subtitle: { fontSize: 12 },
  actionBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtnText: { fontSize: 12, fontWeight: '800' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 10 },
  searchInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1 },
  clearBtn: { paddingHorizontal: 8 },
  saveRouteBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 4 },
  filterBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  activeChipsRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  activeChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  activeChipClose: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 2 },
  filterSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  filterSheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  filterSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  filterPillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterPillWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  filterPillText: { fontSize: 12, fontWeight: '600' },
  filterActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  filterActionBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  filterActionText: { fontSize: 15, fontWeight: '800' },
  card: { borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#263244', backgroundColor: '#111827' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  route: { fontSize: 17, fontWeight: '700', marginBottom: 5, letterSpacing: -0.2, color: '#F8FAFC' },
  cargoName: { fontSize: 12, marginBottom: 8 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 16, fontSize: 10, fontWeight: '700', overflow: 'hidden' },
  price: { color: '#22C55E', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  bidsCount: { fontSize: 10, marginTop: 2 },
  driverName: { fontSize: 16, fontWeight: '700' },
  rating: { color: '#FBBF24', fontSize: 12, fontWeight: '700', marginVertical: 4 },
  tripBadge: { position: 'absolute', top: -1, right: 12, backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  tripBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  mineBadge: { position: 'absolute', top: -1, right: 12, paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  mineBadgeText: { color: '#0C0A09', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  quickChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  quickChipText: { fontSize: 11, fontWeight: '700' },
  tripRoute: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  tripDates: { fontSize: 11, marginTop: 2 },
  cargoPreview: { width: '100%', height: 140, borderRadius: 10, marginTop: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#44403C', alignSelf: 'center', marginBottom: 18 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  fi: { borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1, marginBottom: 10 },
  frow: { flexDirection: 'row', gap: 8 },
  formLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' },
  hintBox: { backgroundColor: '#22C55E15', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#22C55E30' },
  hintText: { fontSize: 11, lineHeight: 16 },
  typeCard: { width: 88, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  typeCardText: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  currChip: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  currChipText: { fontSize: 12, fontWeight: '700' },
  fieldError: { color: '#EF4444', fontSize: 11, marginTop: -6, marginBottom: 8, fontWeight: '600' },
  photoPicker: { borderRadius: 14, padding: 20, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, minHeight: 120 },
  photoImg: { width: '100%', height: 140, borderRadius: 10 },
  photoText: { fontSize: 13, fontWeight: '600' },
  submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
