import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import { normalizeTrip, formatPrice, CURRENCY_SYMBOLS } from '../utils/normalizers';
import { normalizeDateInput, formatDateForDisplay } from '../utils/dateInput';
import LocationPickerModal from '../components/LocationPickerModal';
import DatePicker from '../components/DatePicker';
import {v1Colors, useV1Colors, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import TruckTypeGrid from '../components/TruckTypeGrid';
import Feather from '@expo/vector-icons/Feather';

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
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [transit, setTransit] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [truckType, setTruckType] = useState(null);
  const [capacityTons, setCapacityTons] = useState('');
  const [availableM3, setAvailableM3] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const priceRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const priceInputY = React.useRef(0);

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
    setPrice(t.price > 0 ? String(t.price) : '');
    setCurrency((t.currency || 'USD').toUpperCase());
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
    const priceNum = Math.max(0, parseInt(String(price || '').trim().replace(/\s/g, ''), 10) || 0);
    if (priceNum <= 0) { toast(t('val_price_required'), 'error'); return; }
    setSaving(true);
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
      currency: currency || 'USD',
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="edit-3" size={16} color={v1.text} />
          <Text style={[s.title, { color: v1.text }]}>{t('edit_btn')}</Text>
        </View>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Stage 11: bring EditTrip onto the same RoutePointPicker
            that Create-flows already use. Same country → type → point
            stages, same auto-close, same theme. Transit stays a free
            TextInput because the registry doesn't model multi-leg
            transits. */}
        <Text style={[s.label, { color: theme.textMuted }]}>{t('fromCountry')}</Text>
        <TouchableOpacity
          style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, justifyContent: 'center', marginBottom: 10 }]}
          onPress={() => setShowFromPicker(true)}
        >
          {from ? (
            <Text style={{ color: theme.text, fontSize: 15 }}>{from}</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="map-pin" size={15} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, fontSize: 15 }}>{t('fromCountry')}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={[s.label, { color: theme.textMuted }]}>{t('toCountry')}</Text>
        <TouchableOpacity
          style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, justifyContent: 'center', marginBottom: 10 }]}
          onPress={() => setShowToPicker(true)}
        >
          {to ? (
            <Text style={{ color: theme.text, fontSize: 15 }}>{to}</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="flag" size={15} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, fontSize: 15 }}>{t('toCountry')}</Text>
            </View>
          )}
        </TouchableOpacity>

        <LocationPickerModal
          visible={showFromPicker}
          onClose={() => setShowFromPicker(false)}
          title={t('loc_from_title')}
          showGeo
          onSelect={(v, point) => { setFrom(v); setFromPoint(point || null); }}
        />
        <LocationPickerModal
          visible={showToPicker}
          onClose={() => setShowToPicker(false)}
          title={t('loc_to_title')}
          onSelect={(v, point) => { setTo(v); setToPoint(point || null); }}
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6 }}>
          <Feather name="dollar-sign" size={13} color={theme.textMuted} />
          <Text style={[s.label, { color: theme.textMuted, marginTop: 0, marginBottom: 0 }]}>{t('payment_label_full')}</Text>
        </View>
        <View style={[s.row, { marginBottom: 10 }]} onLayout={(e) => { priceInputY.current = e.nativeEvent.layout.y; }}>
          <TextInput
            ref={priceRef}
            style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border, flex: 2 }]}
            placeholder={t('price_example_placeholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="numeric"
            inputMode="numeric"
            value={price}
            onChangeText={(v) => setPrice(String(v || '').replace(/[^\d]/g, ''))}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 3 }}>
            {/* Pilot whitelist matches Create flows (USD / CNY / RUB / EUR). */}
            {['USD', 'CNY', 'RUB', 'EUR'].map(k => (
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

        <Text style={[s.label, { color: truckType ? theme.textMuted : '#EF4444' }]}>
          {t('truckType')}{!truckType ? ' *' : ''}
        </Text>
        <TruckTypeGrid value={truckType} accent={v1Accent.main} onSelect={(k) => setTruckType(k)} />

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

        <TouchableOpacity
          activeOpacity={0.7}
          style={[s.previewCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => {
            scrollRef.current?.scrollTo({ y: priceInputY.current, animated: true });
            setTimeout(() => priceRef.current?.focus(), 300);
          }}
        >
          <Text style={[s.previewLabel, { color: theme.textMuted }]}>{t('price')}</Text>
          <Text style={s.previewPrice}>{formatPrice(Number(price) || 0, currency, t)}</Text>
          <Feather name="edit-2" size={14} color={theme.textMuted} style={{ position: 'absolute', top: 10, right: 12 }} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={[s.saveBtn, saving && { opacity: 0.6 }]}
          testID="edit-trip-save"
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="save" size={15} color="#fff" />
              <Text style={s.saveBtnText}>{t('save_changes')}</Text>
            </View>
          )}
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
