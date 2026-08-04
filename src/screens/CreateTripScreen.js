import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useToast } from '../components/Toast';
import { useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { normalizeDateInput } from '../utils/dateInput';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Field from '../components/ui/v1/Field';
// PR-C2: Textarea import удалён — comment field больше не используется
// (backend TripIn не имеет comment, симметрия с CreateCargoScreen PR-C1).
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import LocationPickerModal from '../components/LocationPickerModal';
import DatePicker from '../components/DatePicker';
import {v1Colors, useV1Colors, v1Radius, v1Spacing, v1Typography, v1AccentFor} from '../theme/designV1';
import TruckTypeGrid from '../components/TruckTypeGrid';

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

// Pilot currencies (core set): USD / CNY / RUB / EUR only. Mirrors CreateCargoScreen.
const CURRENCY_OPTIONS = [
  { k: 'USD', l: '$' },
  { k: 'CNY', l: '¥' },
  { k: 'RUB', l: '₽' },
  { k: 'EUR', l: '€' },
];

// Дробный ввод (вес/объём): запятую→точку, только цифры и одна точка (31.5 т).
const normalizeDecimal = (v) => {
  let s = String(v || '').replace(',', '.').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
};

export default function CreateTripScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  title: { ...v1Typography.h1, fontSize: 19, fontWeight: '700', letterSpacing: -0.2, marginTop: v1Spacing.sm },
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
    borderWidth: 1, borderRadius: 10, padding: 12,
    marginBottom: v1Spacing.sm,
  },
  priceLabel: { color: v1.text, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  priceModeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  priceMode: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  priceModeText: { fontSize: 13, fontWeight: '700' },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  currencyChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  currencyText: { fontSize: 12, fontWeight: '700' },
  infoBox: {
    borderWidth: 1, borderRadius: 10,
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
  const [fromPoint, setFromPoint] = useState(null);
  const [to, setTo] = useState('');
  const [toPoint, setToPoint] = useState(null);
  const [transit, setTransit] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [truckType, setTruckType] = useState(null);
  const [tons, setTons] = useState('');
  const [m3, setM3] = useState('');
  // Цена рейса ОБЯЗАТЕЛЬНА (решение владельца): водитель всегда указывает
  // ставку за рейс, «По договорённости» убрана.
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  // PR-C2: comment state удалён вместе с Textarea ниже — backend TripIn
  // не имеет поля comment, значение молча терялось. Симметрично с
  // CreateCargoScreen (PR-C1 fix).
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
    const pNum = parseInt(String(price || '').replace(/\s/g, ''), 10) || 0;
    if (pNum <= 0) errs.price = t('val_price_required');
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = ['from', 'to', 'departure', 'truckType', 'arrival', 'price'].find((k) => errs[k]);
      toast(errs[firstKey] || t('fill_required_fields'), 'error', 4000);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const priceNum = Math.max(0, parseInt(String(price || '').replace(/\s/g, ''), 10) || 0);
    const payload = {
      from_city: from.trim(),
      to_city: to.trim(),
      transit: transit.trim() || null,
      truck_type: truckType,
      // Stage 7: stop silently injecting fake defaults (20t / 82m³).
      // The user explicitly leaves the field blank — the backend's
      // own column default is enough; we only send the number when
      // the user types one.
      capacity_tons: tons ? Number(tons) : null,
      available_m3: m3 ? Number(m3) : null,
      price: priceNum,
      currency: currency,
      departure: departureNorm,
      arrival: arrivalNorm,
      // Stage 8: structured route triple from RoutePointPicker.
      from_country:    fromPoint?.country || null,
      from_point_type: fromPoint?.type    || null,
      from_point_name: fromPoint?.name    || null,
      to_country:      toPoint?.country   || null,
      to_point_type:   toPoint?.type      || null,
      to_point_name:   toPoint?.name      || null,
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

      {/* Откуда / Куда: полноэкранный выбор города (inDrive-стиль). */}
      <Field
        variant="dropdown"
        featherIcon="map-pin"
        label={t('signup_field_country')}
        value={from}
        placeholder={t('create_field_from_placeholder')}
        onPress={() => setShowFromPicker(true)}
      />
      {errors.from ? <Text style={s.err}>⚠️ {errors.from}</Text> : null}

      <Field
        variant="dropdown"
        featherIcon="map-pin"
        label={t('toCountry')}
        value={to}
        placeholder={t('create_field_to_placeholder')}
        onPress={() => setShowToPicker(true)}
      />
      {errors.to ? <Text style={s.err}>⚠️ {errors.to}</Text> : null}

      <LocationPickerModal
        visible={showFromPicker}
        onClose={() => setShowFromPicker(false)}
        title={t('loc_from_title')}
        showGeo
        onSelect={(v, point) => {
          setFrom(v);
          setFromPoint(point || null);
          if (errors.from) setErrors((e) => ({ ...e, from: null }));
        }}
      />
      <LocationPickerModal
        visible={showToPicker}
        onClose={() => setShowToPicker(false)}
        title={t('loc_to_title')}
        onSelect={(v, point) => {
          setTo(v);
          setToPoint(point || null);
          if (errors.to) setErrors((e) => ({ ...e, to: null }));
        }}
      />

      {/* Дата выезда + Тип кузова — 2 колонки */}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            featherIcon="calendar"
            label={t('departure')}
            value={departure}
            placeholder=""
            onPress={() => setShowDeparturePicker((v) => !v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            featherIcon="truck"
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
            onChange={(v) => {
              setDeparture(v);
              if (errors.departure) setErrors((e) => ({ ...e, departure: null }));
              if (v && v.trim()) setShowDeparturePicker(false);
            }}
            placeholder={t('departure')}
            // PR-C2: симметрично с CreateCargoScreen — над DatePicker уже
            // есть Field-row trigger «Дата отправления», поэтому открываем
            // календарь сразу (defaultOpen) и не рендерим встроенный
            // preview-row. Без этого пользователь видит две строки даты.
            defaultOpen
            // Снимаем trigger-флаг при закрытии без выбора, иначе остаётся
            // пустой подсвеченный блок (см. CreateCargoScreen).
            onClose={() => setShowDeparturePicker(false)}
          />
        </View>
      ) : null}
      <BottomSheet visible={showTruckPicker} onClose={() => setShowTruckPicker(false)} title={t('truckType')}>
        <TruckTypeGrid
          value={truckType}
          accent={accent.main}
          onSelect={(k) => { setTruckType(k); if (errors.truckType) setErrors((e) => ({ ...e, truckType: null })); setShowTruckPicker(false); }}
        />
      </BottomSheet>
      {errors.departure ? <Text style={s.err}>⚠️ {errors.departure}</Text> : null}
      {errors.truckType ? <Text style={s.err}>⚠️ {errors.truckType}</Text> : null}

      {/* Stage 27: placeholder "—" → пример числа; label с
          единицей. Те же изменения, что в CreateCargoScreen. */}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('weight_label')}
            value={tons}
            onChangeText={(v) => setTons(normalizeDecimal(v))}
            keyboardType="decimal-pad"
            placeholder={t('weight_placeholder') || 'Например: 31.5'}
            testID="trip-weight-field"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('volume_label')}
            value={m3}
            onChangeText={(v) => setM3(normalizeDecimal(v))}
            keyboardType="decimal-pad"
            placeholder={t('volume_placeholder') || 'Например: 110'}
            testID="trip-volume-field"
          />
        </View>
      </View>

      {/* Цена block */}
      <View style={[s.priceCard, { borderColor: v1.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Feather name="dollar-sign" size={15} color={v1.text} />
          <Text style={[s.priceLabel, { marginBottom: 0 }]}>{t('payment_label_full')}</Text>
        </View>
        <View style={s.row2}>
          <View style={{ flex: 1 }}>
            <Field
              featherIcon="credit-card"
              label={t('amount_label')}
              value={price}
              onChangeText={(v) => { setPrice(String(v || '').replace(/[^\d]/g, '')); if (errors.price) setErrors((e) => ({ ...e, price: null })); }}
              keyboardType="numeric"
              placeholder={t('price_example_placeholder')}
              testID="trip-price-input"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              variant="dropdown"
              featherIcon="dollar-sign"
              label={t('currency_label')}
              value={`${(CURRENCY_OPTIONS.find((c) => c.k === currency) || {}).l || ''} ${currency}`}
              onPress={() => setShowCurrencyPicker((v) => !v)}
            />
          </View>
        </View>
        {errors.price ? <Text style={s.err}>⚠️ {errors.price}</Text> : null}
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

      {/* PR-C2: Textarea «Комментарий» удалён — backend TripIn модель
          (backend/api/marketplace.py) не имеет поля comment, значение
          молча терялось. Симметрично с CreateCargoScreen (PR-C1). */}

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
        style={{ marginTop: v1Spacing.sm, height: 44, borderRadius: 10 }}
      />

      {/* Draft link — backend doesn't accept status='draft' yet, so this is
          a visual placeholder per the macro. */}
      <TouchableOpacity onPress={() => toast(t('feature_coming_soon'), 'info', 2500)} style={s.draftRow} activeOpacity={0.7}>
        <Text style={[s.draftText, { color: accent.main }]}>{t('create_route_save_draft')}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

