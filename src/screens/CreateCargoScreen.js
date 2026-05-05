import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useToast } from '../components/Toast';
import { useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Field from '../components/ui/v1/Field';
import Textarea from '../components/ui/v1/Textarea';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import RoutePointPicker from '../components/RoutePointPicker';
import CargoTypeInput from '../components/CargoTypeInput';
import DatePicker from '../components/DatePicker';
import { PhotoPicker } from '../components/PhotoGallery';
import {v1Colors, useV1Colors, v1Radius, v1Spacing, v1Typography, v1AccentFor} from '../theme/designV1';
import { TRUCK_KEYS, TRUCK_ICONS } from '../utils/truckConstants';

// CreateCargoScreen — design v1, screen 10. Cargo owner publishes a load.
//
// Mirrors CreateTripScreen structurally, with three differences:
//   - extra "Описание груза" dropdown (CargoTypeInput overlay)
//   - photo picker (collapsible "Фото груза (необязательно)")
//   - orange brand accent

// Pilot currencies (Stage 5 / rev. 3): RUB / USD / KZT / CNY only.
// Removed: UZS / KGS / EUR / AED. Old persisted cargo with a removed
// currency still reads safely — the backend marketplace.py keeps a
// permissive read path; only NEW publish actions are constrained.
const CURRENCY_OPTIONS = [
  { k: 'KZT', l: '₸' },
  { k: 'USD', l: '$' },
  { k: 'RUB', l: '₽' },
  { k: 'CNY', l: '¥' },
];

export default function CreateCargoScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  title: { ...v1Typography.h1, marginTop: v1Spacing.sm },
  subtitle: { ...v1Typography.bodyMd, marginTop: 4, marginBottom: v1Spacing.md },
  row2: { flexDirection: 'row', gap: 10 },
  truckScroll: { gap: 8, paddingVertical: 4, paddingBottom: 10 },
  truckChip: { width: 80, paddingVertical: 10, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: v1Radius.field },
  truckChipText: { fontSize: 11, fontWeight: '700' },
  pickerWrap: { marginBottom: v1Spacing.sm, zIndex: 50 },
  err: { color: v1Colors.error, fontSize: 11, marginTop: 4, marginLeft: 6, marginBottom: 6 },
  priceCard: { borderWidth: 1, borderRadius: v1Radius.card, padding: 12, marginBottom: v1Spacing.sm },
  priceLabel: { color: v1.text, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  priceModeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  priceMode: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center' },
  priceModeText: { fontSize: 13, fontWeight: '700' },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  currencyChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  currencyText: { fontSize: 12, fontWeight: '700' },
  photoToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderRadius: v1Radius.field,
    backgroundColor: v1.surface,
    marginBottom: v1Spacing.sm,
  },
  photoIcon: { fontSize: 16, color: v1.textMuted, width: 20, textAlign: 'center' },
  photoLabel: { color: v1.text, fontSize: 13, fontWeight: '700' },
  photoSub: { color: v1.textMuted, fontSize: 11, marginTop: 2 },
  photoChevron: { fontSize: 18, fontWeight: '900' },
  infoBox: { borderWidth: 1, borderRadius: v1Radius.field, padding: 12, marginTop: v1Spacing.sm, marginBottom: v1Spacing.md },
  infoText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  draftRow: { alignItems: 'center', marginTop: v1Spacing.md, paddingVertical: 8 },
  draftText: { fontSize: 13, fontWeight: '700' },

  }), [v1]);
  const role = route?.params?.role || 'client';
  const accent = v1AccentFor('client');
  const { t } = useI18n();
  const { toast } = useToast();
  const { session } = useAuth();

  const [from, setFrom] = useState('');
  const [fromPoint, setFromPoint] = useState(null);   // structured point from RoutePointPicker
  const [to, setTo] = useState('');
  const [toPoint, setToPoint] = useState(null);
  const [cargoDesc, setCargoDesc] = useState('');
  const [truckType, setTruckType] = useState('tent');
  const [pickupDate, setPickupDate] = useState('');
  const [tons, setTons] = useState('');
  const [m3, setM3] = useState('');
  const [priceMode, setPriceMode] = useState('negotiable');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('KZT');
  const [photos, setPhotos] = useState([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Picker overlays
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showDescPicker, setShowDescPicker] = useState(false);
  const [showTruckPicker, setShowTruckPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const errs = {};
    if (!from.trim()) errs.from = t('val_from_required');
    if (!to.trim()) errs.to = t('val_to_required');
    if (!cargoDesc.trim()) errs.cargoDesc = t('val_cargo_desc_required');
    if (!truckType) errs.truckType = t('val_truck_type_required');
    if (!pickupDate) errs.pickupDate = t('val_pickup_date_required');
    const wNum = parseFloat(tons) || 0;
    const vNum = parseFloat(m3) || 0;
    if (wNum <= 0 && vNum <= 0) errs.weight = t('val_weight_or_volume_required');
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = ['from', 'to', 'cargoDesc', 'truckType', 'pickupDate', 'weight'].find((k) => errs[k]);
      toast(errs[firstKey] || t('fill_required_fields'), 'error', 4000);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const priceNum = priceMode === 'fixed'
      ? Math.max(0, parseInt(String(price || '').replace(/\s/g, ''), 10) || 0)
      : 0;
    // Stage 8: forward the structured route triple alongside the
    // legacy from_city / to_city strings. Backend tolerates missing
    // fields (free-text fallback supplies country='XX' for orphans),
    // so the picker output can land directly without further shaping.
    const payload = {
      from_city: from.trim(),
      to_city: to.trim(),
      cargo_desc: cargoDesc.trim(),
      cargo_type: truckType,
      weight_tons: parseInt(tons) || 0,
      volume_m3: parseInt(m3) || 0,
      price: priceNum,
      currency: priceMode === 'fixed' ? currency : 'KZT',
      pickup_date: pickupDate || null,
      photos: photos || [],
      from_country:    fromPoint?.country || null,
      from_point_type: fromPoint?.type    || null,
      from_point_name: fromPoint?.name    || null,
      to_country:      toPoint?.country   || null,
      to_point_type:   toPoint?.type      || null,
      to_point_name:   toPoint?.name      || null,
    };
    try {
      const r = await marketAPI.createCargo(payload);
      if (r.ok || r.id) {
        toast('✓ ' + t('cargo_published'), 'success', 4000);
        navigation.goBack();
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

      <Text style={s.title}>{t('postCargo')}</Text>
      <Text style={s.subtitle}>{t('create_cargo_subtitle')}</Text>

      <Field
        variant="dropdown"
        icon="📍"
        label={t('fromCountry')}
        value={from}
        placeholder={t('create_field_from_placeholder_cargo')}
        onPress={() => setShowFromPicker((v) => !v)}
      />
      {showFromPicker ? (
        <View style={s.pickerWrap}>
          <RoutePointPicker
            value={from}
            onChange={(v, point) => {
              setFrom(v);
              setFromPoint(point || null);
              if (errors.from) setErrors((e) => ({ ...e, from: null }));
              if (v && v.trim()) setShowFromPicker(false);
            }}
            placeholder={'📍 ' + t('fromCountry')}
            testID="cargo-from-input"
          />
        </View>
      ) : null}
      {errors.from ? <Text style={s.err}>⚠️ {errors.from}</Text> : null}

      <Field
        variant="dropdown"
        icon="📍"
        label={t('toCountry')}
        value={to}
        placeholder={t('create_field_to_placeholder_cargo')}
        onPress={() => setShowToPicker((v) => !v)}
      />
      {showToPicker ? (
        <View style={s.pickerWrap}>
          <RoutePointPicker
            value={to}
            onChange={(v, point) => {
              setTo(v);
              setToPoint(point || null);
              if (errors.to) setErrors((e) => ({ ...e, to: null }));
              if (v && v.trim()) setShowToPicker(false);
            }}
            placeholder={'🏁 ' + t('toCountry')}
            testID="cargo-to-input"
          />
        </View>
      ) : null}
      {errors.to ? <Text style={s.err}>⚠️ {errors.to}</Text> : null}

      <Field
        variant="dropdown"
        icon="📦"
        label={t('cargoDesc')}
        value={cargoDesc}
        placeholder={t('create_field_desc_placeholder')}
        onPress={() => setShowDescPicker((v) => !v)}
      />
      {showDescPicker ? (
        <View style={s.pickerWrap}>
          <CargoTypeInput
            value={cargoDesc}
            onChange={(v) => {
              setCargoDesc(v);
              if (errors.cargoDesc) setErrors((e) => ({ ...e, cargoDesc: null }));
              if (v && v.trim()) setShowDescPicker(false);
            }}
            placeholder={'📦 ' + t('cargoDesc')}
            testID="cargo-desc-input"
          />
        </View>
      ) : null}
      {errors.cargoDesc ? <Text style={s.err}>⚠️ {errors.cargoDesc}</Text> : null}

      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            icon="🚚"
            label={t('truckType')}
            value={truckType ? t(truckType) : ''}
            onPress={() => setShowTruckPicker((v) => !v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            icon="📅"
            label={t('pickupDate')}
            value={pickupDate}
            onPress={() => setShowDatePicker((v) => !v)}
          />
        </View>
      </View>
      <BottomSheet visible={showTruckPicker} onClose={() => setShowTruckPicker(false)} title={t('truckType')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TRUCK_KEYS.map((k) => {
            const active = truckType === k;
            return (
              <TouchableOpacity
                key={k}
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
      {showDatePicker ? (
        <View style={s.pickerWrap}>
          <DatePicker
            value={pickupDate}
            onChange={(v) => {
              setPickupDate(v);
              if (errors.pickupDate) setErrors((e) => ({ ...e, pickupDate: null }));
              if (v && v.trim()) setShowDatePicker(false);
            }}
            placeholder={t('pickupDate')}
          />
        </View>
      ) : null}
      {errors.truckType ? <Text style={s.err}>⚠️ {errors.truckType}</Text> : null}
      {errors.pickupDate ? <Text style={s.err}>⚠️ {errors.pickupDate}</Text> : null}

      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            icon="⚖️"
            label={t('weight_label')}
            value={tons}
            onChangeText={(v) => { setTons(String(v || '').replace(/[^\d]/g, '')); if (errors.weight) setErrors((e) => ({ ...e, weight: null })); }}
            keyboardType="numeric"
            placeholder="—"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            icon="📐"
            label={t('volume_label')}
            value={m3}
            onChangeText={(v) => { setM3(String(v || '').replace(/[^\d]/g, '')); if (errors.weight) setErrors((e) => ({ ...e, weight: null })); }}
            keyboardType="numeric"
            placeholder="—"
          />
        </View>
      </View>
      {errors.weight ? <Text style={s.err}>⚠️ {errors.weight}</Text> : null}

      {/* Цена block */}
      <View style={[s.priceCard, { borderColor: v1.border }]}>
        <Text style={s.priceLabel}>💰 {t('payment_label_full')}</Text>
        <View style={s.priceModeRow}>
          <TouchableOpacity
            onPress={() => { setPriceMode('negotiable'); setPrice(''); }}
            style={[s.priceMode, priceMode === 'negotiable' ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
          >
            <Text style={[s.priceModeText, { color: priceMode === 'negotiable' ? '#0A0A0A' : v1.textMuted }]}>{t('payment_negotiable')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
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
              onPress={() => { setCurrency(c.k); setShowCurrencyPicker(false); }}
              style={[s.currencyChip, currency === c.k ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
            >
              <Text style={[s.currencyText, { color: currency === c.k ? '#0A0A0A' : v1.textMuted }]}>{c.l} {c.k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Фото груза — collapsible */}
      <TouchableOpacity onPress={() => setShowPhotos((v) => !v)} activeOpacity={0.85} style={[s.photoToggle, { borderColor: v1.border }]}>
        <Text style={s.photoIcon}>🖼</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.photoLabel}>{t('cargo_photos_label')}</Text>
          <Text style={s.photoSub}>{t('cargo_photos_sub')}</Text>
        </View>
        <Text style={[s.photoChevron, { color: accent.main }]}>{showPhotos ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {showPhotos ? (
        <View style={{ marginBottom: v1Spacing.sm }}>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </View>
      ) : null}

      <Textarea
        icon="💬"
        label={t('comment_label')}
        value={comment}
        onChangeText={setComment}
        placeholder={t('create_cargo_comment_placeholder')}
      />

      <View style={[s.infoBox, { backgroundColor: accent.soft, borderColor: accent.main }]}>
        <Text style={[s.infoText, { color: accent.main }]} numberOfLines={3}>
          🛡  {t('create_cargo_visibility')}
        </Text>
      </View>

      <PrimaryButton
        label={t('publish_cargo_action')}
        onPress={submit}
        loading={submitting}
        accent="cargo"
        testID="cargo-submit-button"
        style={{ marginTop: v1Spacing.sm }}
      />

      <TouchableOpacity onPress={() => toast(t('feature_coming_soon'), 'info', 2500)} style={s.draftRow} activeOpacity={0.7}>
        <Text style={[s.draftText, { color: accent.main }]}>{t('create_route_save_draft')}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

