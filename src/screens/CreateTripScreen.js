import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useToast } from '../components/Toast';
import { useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { normalizeDateInput } from '../utils/dateInput';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Field from '../components/ui/v1/Field';
import Textarea from '../components/ui/v1/Textarea';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import CityInput from '../components/CityInput';
import DatePicker from '../components/DatePicker';
import {v1Colors, useV1Colors, v1Radius, v1Spacing, v1Typography, v1AccentFor} from '../theme/designV1';
import { TRUCK_KEYS, TRUCK_ICONS } from '../utils/truckConstants';

// CreateTripScreen — design v1, screen 09. Driver publishes a route.
//
// Business logic preserved from the previous in-FeedScreen modal:
//   - normalizeDateInput for timezone-stable submission
//   - marketAPI.createTrip(payload)
//   - validation order matches the old `submitTrip` (toast first error)
//   - on success → navigate('MyTripsList', { initialTab:'my', justCreatedTrip })
//
// "Сохранить как черновик" is a visual stub for now: backend has no
// status='draft', so the link is disabled with a hint to keep filling.

// Pilot currencies (Stage 5 / rev. 3): RUB / USD / KZT / CNY only.
// Removed: UZS / KGS / EUR / AED. Mirrors CreateCargoScreen.
const CURRENCY_OPTIONS = [
  { k: 'KZT', l: '₸' },
  { k: 'USD', l: '$' },
  { k: 'RUB', l: '₽' },
  { k: 'CNY', l: '¥' },
];

export default function CreateTripScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  title: { ...v1Typography.h1, marginTop: v1Spacing.sm },
  subtitle: { ...v1Typography.bodyMd, marginTop: 4, marginBottom: v1Spacing.md },
  row2: { flexDirection: 'row', gap: 10 },
  truckScroll: { gap: 8, paddingVertical: 4, paddingBottom: 10 },
  truckChip: {
    width: 80, paddingVertical: 10, alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: v1Radius.field,
  },
  truckChipText: { fontSize: 11, fontWeight: '700' },
  pickerWrap: { marginBottom: v1Spacing.sm, zIndex: 50 },
  err: { color: v1Colors.error, fontSize: 11, marginTop: 4, marginLeft: 6, marginBottom: 6 },
  priceCard: {
    borderWidth: 1, borderRadius: v1Radius.card, padding: 12,
    marginBottom: v1Spacing.sm,
  },
  priceLabel: { color: v1.text, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  priceModeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  priceMode: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center' },
  priceModeText: { fontSize: 13, fontWeight: '700' },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  currencyChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  currencyText: { fontSize: 12, fontWeight: '700' },
  infoBox: {
    borderWidth: 1, borderRadius: v1Radius.field,
    padding: 12, marginTop: v1Spacing.sm, marginBottom: v1Spacing.md,
  },
  infoText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  draftRow: { alignItems: 'center', marginTop: v1Spacing.md, paddingVertical: 8 },
  draftText: { fontSize: 13, fontWeight: '700' },

  }), [v1]);
  const role = route?.params?.role || 'driver';
  const accent = v1AccentFor('driver');
  const { t } = useI18n();
  const { toast } = useToast();
  const { session } = useAuth();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [transit, setTransit] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [truckType, setTruckType] = useState(null);
  const [tons, setTons] = useState('');
  const [m3, setM3] = useState('');
  const [priceMode, setPriceMode] = useState('negotiable');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('KZT');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // City / date pickers reuse the existing standalone components: tapping
  // a Field row toggles the corresponding picker into a portal-like overlay.
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showArrivalPicker, setShowArrivalPicker] = useState(false);
  const [showTruckPicker, setShowTruckPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const errs = {};
    if (!from.trim()) errs.from = t('val_from_required');
    if (!to.trim()) errs.to = t('val_to_required');
    if (!departure) errs.departure = t('val_departure_required');
    if (!truckType) errs.truckType = t('val_truck_type_required');

    const departureNorm = normalizeDateInput(departure);
    const arrivalNorm = arrival ? normalizeDateInput(arrival) : null;
    if (departure && !departureNorm) errs.departure = t('val_date_invalid');
    if (arrival && !arrivalNorm) errs.arrival = t('val_date_invalid');
    if (departureNorm && arrivalNorm && arrivalNorm < departureNorm) {
      errs.arrival = t('val_arrival_before_departure');
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = ['from', 'to', 'departure', 'truckType', 'arrival'].find((k) => errs[k]);
      toast(errs[firstKey] || t('fill_required_fields'), 'error', 4000);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const priceNum = priceMode === 'fixed'
      ? Math.max(0, parseInt(String(price || '').replace(/\s/g, ''), 10) || 0)
      : 0;
    const payload = {
      from_city: from.trim(),
      to_city: to.trim(),
      transit: transit.trim() || null,
      truck_type: truckType,
      capacity_tons: Number(tons) || 20,
      available_m3: Number(m3) || 82,
      price: priceNum,
      currency: priceMode === 'fixed' ? currency : 'KZT',
      departure: departureNorm,
      arrival: arrivalNorm,
    };
    try {
      const r = await marketAPI.createTrip(payload);
      if (r.ok || r.id) {
        toast('✓ ' + t('trip_published'), 'success', 4000);
        const justCreated = { id: r.id, ...payload, status: 'active', created_at: new Date().toISOString() };
        navigation.replace('MyTripsList', { role, initialTab: 'my', justCreatedTrip: justCreated });
      } else {
        toast(r.detail || t('send_error'), 'error');
      }
    } catch (e) {
      toast(t('network_error') + ': ' + (e?.message || ''), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen contentStyle={{ paddingBottom: 80 }}>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent.main} />

      <Text style={s.title}>{t('postTrip')}</Text>
      <Text style={s.subtitle}>{t('create_trip_subtitle')}</Text>

      {/* Откуда / Куда: tap-through to the existing CityInput overlay */}
      <Field
        variant="dropdown"
        icon="📍"
        label={t('signup_field_country')}
        value={from}
        placeholder={t('create_field_from_placeholder')}
        onPress={() => setShowFromPicker((v) => !v)}
      />
      {showFromPicker ? (
        <View style={s.pickerWrap}>
          <CityInput value={from} onChange={(v) => { setFrom(v); if (errors.from) setErrors((e) => ({ ...e, from: null })); }} placeholder={'📍 ' + t('fromCountry')} testID="trip-from-input" />
        </View>
      ) : null}
      {errors.from ? <Text style={s.err}>⚠️ {errors.from}</Text> : null}

      <Field
        variant="dropdown"
        icon="📍"
        label={t('toCountry')}
        value={to}
        placeholder={t('create_field_to_placeholder')}
        onPress={() => setShowToPicker((v) => !v)}
      />
      {showToPicker ? (
        <View style={s.pickerWrap}>
          <CityInput value={to} onChange={(v) => { setTo(v); if (errors.to) setErrors((e) => ({ ...e, to: null })); }} placeholder={'🏁 ' + t('toCountry')} testID="trip-to-input" />
        </View>
      ) : null}
      {errors.to ? <Text style={s.err}>⚠️ {errors.to}</Text> : null}

      {/* Дата выезда + Тип кузова — 2 колонки */}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            icon="📅"
            label={t('departure')}
            value={departure}
            placeholder=""
            onPress={() => setShowDeparturePicker((v) => !v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            icon="🚚"
            label={t('truckType')}
            value={truckType ? t(truckType) : ''}
            placeholder=""
            onPress={() => setShowTruckPicker((v) => !v)}
          />
        </View>
      </View>
      {showDeparturePicker ? (
        <View style={s.pickerWrap}>
          <DatePicker
            value={departure}
            onChange={(v) => { setDeparture(v); if (errors.departure) setErrors((e) => ({ ...e, departure: null })); }}
            placeholder={t('departure')}
          />
        </View>
      ) : null}
      <BottomSheet visible={showTruckPicker} onClose={() => setShowTruckPicker(false)} title={t('truckType')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TRUCK_KEYS.map((k) => {
            const active = truckType === k;
            return (
              <TouchableOpacity
                key={k}
                testID={`trip-truck-${k}`}
                onPress={() => { setTruckType(k); if (errors.truckType) setErrors((e) => ({ ...e, truckType: null })); setShowTruckPicker(false); }}
                style={[s.truckChip, active ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
              >
                <Text style={{ fontSize: 22 }}>{TRUCK_ICONS[k]}</Text>
                <Text style={[s.truckChipText, { color: active ? '#0A0A0A' : v1.textMuted }]}>{t(k)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
      {errors.departure ? <Text style={s.err}>⚠️ {errors.departure}</Text> : null}
      {errors.truckType ? <Text style={s.err}>⚠️ {errors.truckType}</Text> : null}

      {/* Грузоподъёмность + Объём */}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            icon="🔒"
            label={t('weight_label')}
            value={tons}
            onChangeText={(v) => setTons(String(v || '').replace(/[^\d]/g, ''))}
            keyboardType="numeric"
            placeholder="20"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            icon="📦"
            label={t('volume_label')}
            value={m3}
            onChangeText={(v) => setM3(String(v || '').replace(/[^\d]/g, ''))}
            keyboardType="numeric"
            placeholder="82"
          />
        </View>
      </View>

      {/* Цена block */}
      <View style={[s.priceCard, { borderColor: v1.border }]}>
        <Text style={s.priceLabel}>💰 {t('payment_label_full')}</Text>
        <View style={s.priceModeRow}>
          <TouchableOpacity
            testID="trip-payment-negotiable"
            onPress={() => { setPriceMode('negotiable'); setPrice(''); }}
            style={[s.priceMode, priceMode === 'negotiable' ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
          >
            <Text style={[s.priceModeText, { color: priceMode === 'negotiable' ? '#0A0A0A' : v1.textMuted }]}>{t('payment_negotiable')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="trip-payment-fixed"
            onPress={() => setPriceMode('fixed')}
            style={[s.priceMode, priceMode === 'fixed' ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
          >
            <Text style={[s.priceModeText, { color: priceMode === 'fixed' ? '#0A0A0A' : v1.textMuted }]}>{t('payment_fixed')}</Text>
          </TouchableOpacity>
        </View>
        {priceMode === 'fixed' ? (
          <View style={s.row2}>
            <View style={{ flex: 1 }}>
              <Field
                icon="💳"
                label={t('amount_label')}
                value={price}
                onChangeText={(v) => setPrice(String(v || '').replace(/[^\d]/g, ''))}
                keyboardType="numeric"
                placeholder={t('price_example_placeholder')}
                testID="trip-price-input"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                variant="dropdown"
                icon="¤"
                label={t('currency_label')}
                value={`${(CURRENCY_OPTIONS.find((c) => c.k === currency) || {}).l || ''} ${currency}`}
                onPress={() => setShowCurrencyPicker((v) => !v)}
              />
            </View>
          </View>
        ) : null}
      </View>
      <BottomSheet visible={showCurrencyPicker} onClose={() => setShowCurrencyPicker(false)} title={t('currency_label')}>
        <View style={s.currencyRow}>
          {CURRENCY_OPTIONS.map((c) => (
            <TouchableOpacity
              key={c.k}
              testID={`trip-currency-${c.k}`}
              onPress={() => { setCurrency(c.k); setShowCurrencyPicker(false); }}
              style={[s.currencyChip, currency === c.k ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
            >
              <Text style={[s.currencyText, { color: currency === c.k ? '#0A0A0A' : v1.textMuted }]}>{c.l} {c.k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      <Textarea
        icon="💬"
        label={t('comment_label')}
        value={comment}
        onChangeText={setComment}
        placeholder={t('create_trip_comment_placeholder')}
      />

      <View style={[s.infoBox, { backgroundColor: accent.soft, borderColor: accent.main }]}>
        <Text style={[s.infoText, { color: accent.main }]} numberOfLines={3}>
          🛡  {t('create_route_visibility')}
        </Text>
      </View>

      <PrimaryButton
        label={t('publish_trip_action')}
        onPress={submit}
        loading={submitting}
        accent="driver"
        testID="trip-submit-button"
        style={{ marginTop: v1Spacing.sm }}
      />

      {/* Draft link — backend doesn't accept status='draft' yet, so this is
          a visual placeholder per the macro. */}
      <TouchableOpacity onPress={() => toast(t('feature_coming_soon'), 'info', 2500)} style={s.draftRow} activeOpacity={0.7}>
        <Text style={[s.draftText, { color: accent.main }]}>{t('create_route_save_draft')}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

