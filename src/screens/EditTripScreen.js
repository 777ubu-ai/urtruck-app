import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import { normalizeTrip, formatPrice, CURRENCY_SYMBOLS } from '../utils/normalizers';
import { normalizeDateInput, formatDateForDisplay } from '../utils/dateInput';
import RoutePointPicker from '../components/RoutePointPicker';
import DatePicker from '../components/DatePicker';
import {v1Colors, useV1Colors, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import TruckTypeIcon from '../components/TruckTypeIcon';

const TRUCK_KEYS = ['tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40', 'jumbo', 'mega', 'curtain', 'lowloader', 'tanker', 'dumptruck', 'grain', 'livestock', 'logger', 'hazmat', 'open_truck', 'closed', 'longliner', 'microvan'];
const TRUCK_ICONS = {
  tent: '🚚', ref: '🧊', platform: '🛻', auto: '🚗', izoterm: '❄️',
  cont20: '📦', cont40: '📦', jumbo: '🚛', mega: '🚛',
  curtain: '🚛', lowloader: '🏗️', tanker: '🛢️', dumptruck: '🚜',
  grain: '🌾', livestock: '🐄', logger: '🪵', hazmat: '☢️',
  open_truck: '🚚', closed: '🚐', longliner: '🚛', microvan: '🚐',
};

export default function EditTripScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { tripId, trip: paramTrip } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const [loading, setLoading] = useState(!paramTrip);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState(() => normalizeTrip(paramTrip));
  const [from, setFrom] = useState('');
  const [fromPoint, setFromPoint] = useState(null);
  const [to, setTo] = useState('');
  const [toPoint, setToPoint] = useState(null);
  const [transit, setTransit] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [truckType, setTruckType] = useState(null);
  const [capacityTons, setCapacityTons] = useState('');
  const [availableM3, setAvailableM3] = useState('');
  const [priceMode, setPriceMode] = useState('negotiable');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Hydrate form from current trip values once we have them.
  const hydrateFromTrip = (t) => {
    if (!t) return;
    setFrom(t.from || '');
    setTo(t.to || '');
    setTransit(t.transit || '');
    setDeparture(t.departure ? formatDateForDisplay(t.departure) : '');
    setArrival(t.arrival ? formatDateForDisplay(t.arrival) : '');
    setTruckType(t.truckType || null);
    setCapacityTons(t.capacityTons != null ? String(t.capacityTons) : '');
    setAvailableM3(t.availableM3 != null ? String(t.availableM3) : '');
    if (t.price > 0) {
      setPriceMode('fixed');
      setPrice(String(t.price));
      setCurrency((t.currency || 'USD').toUpperCase());
    } else {
      setPriceMode('negotiable');
      setPrice('');
      setCurrency((t.currency || 'USD').toUpperCase());
    }
  };

  useEffect(() => {
    if (trip && trip.id) {
      hydrateFromTrip(trip);
      return;
    }
    if (!tripId) return;
    marketAPI.getTrip(tripId).then(d => {
      const norm = normalizeTrip(d);
      if (norm && norm.id) {
        setTrip(norm);
        hydrateFromTrip(norm);
      } else {
        toast(t('not_specified'), 'error');
      }
    }).catch(() => toast(t('no_connection'), 'error'))
      .finally(() => setLoading(false));
  }, [tripId]);

  const onSave = async () => {
    if (saving) return;
    if (!from.trim()) { toast(t('val_from_required'), 'error'); return; }
    if (!to.trim()) { toast(t('val_to_required'), 'error'); return; }
    if (!truckType) { toast(t('val_truck_type_required'), 'error'); return; }
    const departureNorm = normalizeDateInput(departure);
    const arrivalNorm = arrival ? normalizeDateInput(arrival) : null;
    if (departure && !departureNorm) { toast(t('val_date_invalid'), 'error'); return; }
    if (arrival && !arrivalNorm) { toast(t('val_date_invalid'), 'error'); return; }
    if (departureNorm && arrivalNorm && arrivalNorm < departureNorm) {
      toast(t('val_arrival_before_departure'), 'error'); return;
    }
    setSaving(true);
    const priceNum = priceMode === 'fixed'
      ? Math.max(0, parseInt(String(price || '').trim().replace(/\s/g, ''), 10) || 0)
      : 0;
    const payload = {
      from_city: from.trim(),
      to_city: to.trim(),
      transit: transit.trim() || null,
      departure: departureNorm,
      arrival: arrivalNorm,
      truck_type: truckType,
      // Stage 7 / Stage 13: send empty fields as null, not as 0,
      // so the column default kicks in instead of silently writing
      // 0 t / 0 m³.
      capacity_tons: capacityTons ? Number(capacityTons) : null,
      available_m3: availableM3 ? Number(availableM3) : null,
      price: priceNum,
      currency: priceMode === 'fixed' ? currency : (currency || 'USD'),
      // Stage 8 / Stage 13: forward the structured route triple
      // when the picker provided one. If `fromPoint` / `toPoint`
      // is null the user didn't change the route, so we omit the
      // fields entirely; backend's update_trip leaves the existing
      // structured columns untouched in that case.
      ...(fromPoint && {
        from_country: fromPoint.country || null,
        from_point_type: fromPoint.type || null,
        from_point_name: fromPoint.name || null,
      }),
      ...(toPoint && {
        to_country: toPoint.country || null,
        to_point_type: toPoint.type || null,
        to_point_name: toPoint.name || null,
      }),
    };
    const r = await marketAPI.updateTrip(trip.id, payload);
    setSaving(false);
    if (r.ok) {
      toast('✓ ' + t('trip_updated_toast'), 'success');
      navigation.goBack();
    } else {
      toast(r.detail || t('update_failed'), 'error');
    }
  };

  // EditTrip is reachable only by the trip owner (driver) — accent stays
  // emerald regardless of viewer role.
  const v1Accent = v1AccentFor('driver');

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
        <BrandBarWithShare onBack={() => navigation.goBack()} accent={v1Accent.main} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={v1Accent.main} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip || !trip.id) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
        <BrandBarWithShare onBack={() => navigation.goBack()} accent={v1Accent.main} />
        <View style={{ padding: 24 }}>
          <Text style={[s.title, { color: v1.text, marginBottom: 12 }]}>{t('edit_btn')}</Text>
          <Text style={{ color: v1.textMuted }}>{t('incomplete_data')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent={v1Accent.main} />
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <Text style={[s.title, { color: v1.text }]}>✏️ {t('edit_btn')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Stage 11: bring EditTrip onto the same RoutePointPicker
            that Create-flows already use. Same country → type → point
            stages, same auto-close, same theme. Transit stays a free
            TextInput because the registry doesn't model multi-leg
            transits. */}
        <Text style={[s.label, { color: theme.textMuted }]}>{t('fromCountry')}</Text>
        <RoutePointPicker
          value={from}
          onChange={(v, point) => { setFrom(v); setFromPoint(point || null); }}
          placeholder={'📍 ' + t('fromCountry')}
        />

        <Text style={[s.label, { color: theme.textMuted }]}>{t('toCountry')}</Text>
        <RoutePointPicker
          value={to}
          onChange={(v, point) => { setTo(v); setToPoint(point || null); }}
          placeholder={'🏁 ' + t('toCountry')}
        />

        <Text style={[s.label, { color: theme.textMuted }]}>{t('transit')}</Text>
        <TextInput
          style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border, marginBottom: 10 }]}
          value={transit}
          onChangeText={setTransit}
          placeholder={'🔄 ' + t('transitOptional')}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />

        <Text style={[s.label, { color: theme.textMuted }]}>{t('departure')} · {t('arrival')}</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <DatePicker value={departure} onChange={setDeparture} placeholder={t('departure')} />
          </View>
          <View style={{ flex: 1 }}>
            <DatePicker value={arrival} onChange={setArrival} placeholder={t('arrival')} />
          </View>
        </View>

        <Text style={[s.label, { color: theme.textMuted }]}>💰 {t('payment_label_full')}</Text>
        <View style={[s.row, { marginBottom: 10 }]}>
          <TouchableOpacity
            style={[s.payModeBtn, { backgroundColor: theme.card, borderColor: theme.border }, priceMode === 'negotiable' && { backgroundColor: '#22C55E', borderColor: '#22C55E' }]}
            onPress={() => { setPriceMode('negotiable'); setPrice(''); }}
          >
            <Text style={[s.payModeText, { color: theme.textSecondary }, priceMode === 'negotiable' && { color: '#fff' }]}>{t('payment_negotiable')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.payModeBtn, { backgroundColor: theme.card, borderColor: theme.border }, priceMode === 'fixed' && { backgroundColor: '#22C55E', borderColor: '#22C55E' }]}
            onPress={() => setPriceMode('fixed')}
          >
            <Text style={[s.payModeText, { color: theme.textSecondary }, priceMode === 'fixed' && { color: '#fff' }]}>{t('payment_fixed')}</Text>
          </TouchableOpacity>
        </View>
        {priceMode === 'fixed' && (
          <View style={[s.row, { marginBottom: 10 }]}>
            <TextInput
              style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border, flex: 2 }]}
              placeholder={t('price_example_placeholder')}
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              inputMode="numeric"
              value={price}
              onChangeText={(v) => setPrice(String(v || '').replace(/[^\d]/g, ''))}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 3 }}>
              {/* Stage 11: pilot whitelist matches Create flows
                  (RUB / USD / KZT / CNY). The legacy
                  Object.keys(CURRENCY_SYMBOLS) iteration also surfaced
                  UZS, which is no longer offered. */}
              {['KZT', 'USD', 'RUB', 'CNY'].map(k => (
                <TouchableOpacity
                  key={k}
                  style={[s.currChip, { backgroundColor: theme.card, borderColor: theme.border }, currency === k && { backgroundColor: '#22C55E', borderColor: '#22C55E' }]}
                  onPress={() => setCurrency(k)}
                >
                  <Text style={[s.currChipText, { color: theme.textSecondary }, currency === k && { color: '#fff' }]}>{CURRENCY_SYMBOLS[k]} {k}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={[s.label, { color: truckType ? theme.textMuted : '#EF4444' }]}>
          {t('truckType')}{!truckType ? ' *' : ''}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {TRUCK_KEYS.map(k => (
            <TouchableOpacity
              key={k}
              style={[s.typeCard, { backgroundColor: theme.card, borderColor: theme.border }, truckType === k && { backgroundColor: '#22C55E', borderColor: '#22C55E' }]}
              onPress={() => setTruckType(k)}
            >
              <TruckTypeIcon type={k} size={24} color={truckType === k ? '#fff' : theme.textSecondary} />
              <Text style={[s.typeCardText, { color: theme.textSecondary }, truckType === k && { color: '#fff' }]}>{t(k)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[s.row, { marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: theme.textMuted }]}>{t('weight_label')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="—"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={capacityTons}
              onChangeText={(v) => setCapacityTons(String(v || '').replace(/[^\d]/g, ''))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: theme.textMuted }]}>{t('volume_label')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="—"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={availableM3}
              onChangeText={(v) => setAvailableM3(String(v || '').replace(/[^\d]/g, ''))}
            />
          </View>
        </View>

        <View style={[s.previewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.previewLabel, { color: theme.textMuted }]}>{t('price')}</Text>
          <Text style={s.previewPrice}>{formatPrice(priceMode === 'fixed' ? Number(price) || 0 : 0, currency, t)}</Text>
        </View>

        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={[s.saveBtn, saving && { opacity: 0.6 }]}
          testID="edit-trip-save"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>💾 {t('save_changes')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  payModeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  payModeText: { fontSize: 13, fontWeight: '700' },
  currChip: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  currChipText: { fontSize: 12, fontWeight: '700' },
  typeCard: { width: 78, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  typeCardText: { fontSize: 11, fontWeight: '600' },
  previewCard: { borderRadius: 14, padding: 16, borderWidth: 1, marginTop: 18, alignItems: 'center' },
  previewLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  previewPrice: { color: '#22C55E', fontSize: 26, fontWeight: '900' },
  saveBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
