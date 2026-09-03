import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { cleanPlaceName, localizePlace } from '../utils/places';
import { countryFlag } from '../utils/countryFlags';
import { useToast } from '../components/Toast';
import { useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Field from '../components/ui/v1/Field';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import BottomSheet from '../components/ui/v1/BottomSheet';
import LocationPickerModal from '../components/LocationPickerModal';
import CargoTypeInput from '../components/CargoTypeInput';
import { addCustomCargoType } from '../utils/cargoTypes';
import DatePicker from '../components/DatePicker';
import { normalizeDateInput } from '../utils/dateInput';
import { PhotoPicker } from '../components/PhotoGallery';
import {v1Colors, useV1Colors, v1Radius, v1Spacing, v1Typography, v1AccentFor} from '../theme/designV1';
import { TRUCK_KEYS } from '../utils/truckConstants';
import TruckTypeGrid from '../components/TruckTypeGrid';

// PR-C1: backend cargos schema (marketplace_schema.sql) и CargoIn
// pydantic-модель (api/marketplace.py:222) НЕ имеют поля comment/note.
// Раньше форма показывала Textarea «Комментарий», пользователь думал
// что вводит важную инфу, при отправке поле молча отрезалось — груз
// уходил без комментария, на CargoDetail его никто никогда не видел.
// Скрываем поле в PR-C1; backend-схему не трогаем (см. scope: no
// backend migration). Если бизнесу понадобится — отдельным PR-D добавим
// колонку cargos.comment + поле в CargoIn + рендер на CargoDetail.

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

// Ввод дробных чисел (вес/объём): запятую → точку, оставляем цифры и ОДНУ точку.
// Позволяет «31.5», «30,5» → «30.5». Раньше режущий /[^\d]/ выбрасывал дробную
// часть, поэтому нельзя было указать 31.5 т.
const normalizeDecimal = (v) => {
  let s = String(v || '').replace(',', '.').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
};

export default function CreateCargoScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  title: { ...v1Typography.h1, fontSize: 19, fontWeight: '700', letterSpacing: -0.2, marginTop: v1Spacing.sm },
  subtitle: { ...v1Typography.bodyMd, marginTop: 4, marginBottom: v1Spacing.md },
  row2: { flexDirection: 'row', gap: 10 },
  truckScroll: { gap: 8, paddingVertical: 4, paddingBottom: 10 },
  truckChip: { width: 80, paddingVertical: 10, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: v1Radius.field },
  truckChipText: { fontSize: 11, fontWeight: '700' },
  pickerWrap: { marginBottom: v1Spacing.sm, zIndex: 50 },
  // Stage 42: блок поля «Описание груза» — теперь inline TextInput.
  fieldBlock: { marginBottom: v1Spacing.sm, zIndex: 100 },
  label: { color: v1.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginLeft: 4 },
  err: { color: v1Colors.error, fontSize: 11, marginTop: 4, marginLeft: 6, marginBottom: 6 },
  priceCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: v1Spacing.sm },
  priceLabel: { color: v1.text, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  priceModeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  priceMode: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  priceModeText: { fontSize: 13, fontWeight: '700' },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  currencyChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  currencyText: { fontSize: 12, fontWeight: '700' },
  photoToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderRadius: 10,
    backgroundColor: v1.surface,
    marginBottom: v1Spacing.sm,
  },
  photoIcon: { fontSize: 16, color: v1.textMuted, width: 20, textAlign: 'center' },
  photoLabel: { color: v1.text, fontSize: 13, fontWeight: '700' },
  photoSub: { color: v1.textMuted, fontSize: 11, marginTop: 2 },
  photoChevron: { fontSize: 15, fontWeight: '900' },
  infoBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: v1Spacing.sm, marginBottom: v1Spacing.md },
  infoText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  draftRow: { alignItems: 'center', marginTop: v1Spacing.md, paddingVertical: 8 },
  draftText: { fontSize: 13, fontWeight: '700' },

  }), [v1]);
  const role = route?.params?.role || 'client';
  const accent = v1AccentFor('client');
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { session } = useAuth();
  const examplePrefix = lang === 'ZH' ? '例如' : lang === 'EN' ? 'e.g.' : lang === 'KK' ? 'мыс.' : 'Например:';
  const examplePlaceholder = (value, fallback) => {
    const raw = String(value || fallback || '').trim();
    if (!raw) return '';
    return /^\d/.test(raw) ? `${examplePrefix} ${raw}` : raw;
  };

  const displayRoutePoint = (raw, point) => {
    const canonical = point?.name || cleanPlaceName(raw || '');
    const localized = localizePlace(canonical, lang) || canonical;
    const flag = point?.country ? countryFlag(point.country) : '';
    return [localized, flag].filter(Boolean).join(', ');
  };

  const [from, setFrom] = useState('');
  const [fromPoint, setFromPoint] = useState(null);   // structured point from RoutePointPicker
  const [to, setTo] = useState('');
  const [toPoint, setToPoint] = useState(null);
  const [cargoDesc, setCargoDesc] = useState('');
  const [truckType, setTruckType] = useState('tent');
  const [pickupDate, setPickupDate] = useState('');
  const [tons, setTons] = useState('');
  const [m3, setM3] = useState('');
  // Цена ОБЯЗАТЕЛЬНА (решение владельца, приказ по скринам): клиент всегда
  // указывает стартовую сумму, «Жду предложений»/«По договорённости» убраны —
  // перевозчики торгуются от конкретной цифры (модель InDrive).
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  // Умная валюта по стране отправления, пока пользователь не выбрал вручную.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  // Тип оплаты (нал/безнал) — важен водителю. '' = не указан.
  const [paymentType, setPaymentType] = useState('');
  const [photos, setPhotos] = useState([]);
  // PR-C1: comment state удалён вместе с Textarea ниже — поле молча
  // терялось, backend не имеет колонки.
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Picker overlays
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  // Stage 42: showDescPicker удалён — Описание груза теперь inline-input.
  const [showTruckPicker, setShowTruckPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const errs = {};
    // Обязательны только маршрут, описание и хотя бы вес/объём. Тип кузова
    // предзаполнен (не барьер), дата и цена — необязательны: клиент часто
    // приходит именно узнать рынок и собрать ставки.
    if (!from.trim()) errs.from = t('val_from_required');
    if (!to.trim()) errs.to = t('val_to_required');
    if (!cargoDesc.trim()) errs.cargoDesc = t('val_cargo_desc_required');
    const wNum = parseFloat(tons) || 0;
    const vNum = parseFloat(m3) || 0;
    if (wNum <= 0 && vNum <= 0) errs.weight = t('val_weight_or_volume_required');
    const pNum = parseInt(String(price || '').replace(/\s/g, ''), 10) || 0;
    if (pNum <= 0) errs.price = t('val_price_required');
    // Дата загрузки обязательна (симметрично рейсу): без неё груз через 2 дня
    // тихо выпадал из ленты, а у владельца висел «активным» без продления.
    const pickupIso = normalizeDateInput(pickupDate);
    if (!pickupIso) errs.pickupDate = t('val_pickup_date_required');
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = ['from', 'to', 'cargoDesc', 'weight', 'price', 'pickupDate'].find((k) => errs[k]);
      toast(errs[firstKey] || t('fill_required_fields'), 'error', 4000);
      return;
    }
    setErrors({});
    setSubmitting(true);
    // Stage 42: если пользователь ввёл custom описание (не из base
    // списка) — сохраняем его в локальный custom-список, чтобы в
    // следующий раз появилось в подсказках.
    try { addCustomCargoType(cargoDesc.trim()); } catch {}
    const priceNum = Math.max(0, parseInt(String(price || '').replace(/\s/g, ''), 10) || 0);
    // Stage 8: forward the structured route triple alongside the
    // legacy from_city / to_city strings. Backend tolerates missing
    // fields (free-text fallback supplies country='XX' for orphans),
    // so the picker output can land directly without further shaping.
    const payload = {
      from_city: fromPoint?.name || cleanPlaceName(from.trim()),
      to_city: toPoint?.name || cleanPlaceName(to.trim()),
      cargo_desc: cargoDesc.trim(),
      cargo_type: truckType,
      weight_tons: parseFloat(tons) || 0,
      volume_m3: parseFloat(m3) || 0,
      price: priceNum,
      currency: currency,
      payment_type: paymentType || null,
      pickup_date: pickupIso,   // ISO (нормализовано), не сырой DD.MM.YYYY
      photos: photos || [],
      from_country:    fromPoint?.country || null,
      from_point_type: fromPoint?.type    || null,
      from_point_name: fromPoint?.name    || null,
      to_country:      toPoint?.country   || null,
      to_point_type:   toPoint?.type      || null,
      to_point_name:   toPoint?.name      || null,
    };
    try {
      // 27.07: фото сперва грузим в storage → ключи, и только их шлём в
      // payload. Раньше сохранялся локальный uri устройства (blob:/file:) —
      // у другого пользователя фото не открывалось. Битую загрузку пропускаем,
      // публикацию груза из-за фото не срываем.
      if (photos && photos.length) {
        const keys = [];
        for (const uri of photos) {
          try {
            const up = await marketAPI.uploadCargoPhoto(uri);
            if (up?.photo_key) keys.push(up.photo_key);
          } catch (e) { console.warn('[cargo] photo upload skipped:', e?.message); }
        }
        payload.photos = keys;
      }
      const r = await marketAPI.createCargo(payload);
      if (r.ok || r.id) {
        toast('✓ ' + t('cargo_published'), 'success', 4000);
        // P0 (owner fix) — см. CreateTripScreen.js: popToTop() возвращает к
        // уже смонтированному Main→MyWork без дублей в стеке. Известная
        // особенность: BottomNav может не перерисоваться на самом первом
        // кадре (не устранена в рамках этой сессии), но системный Back с
        // этого кадра всегда ведёт на рабочий Main→MyWork с таббаром.
        navigation.popToTop();
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
        featherIcon="map-pin"
        label={t('fromCountry')}
        value={displayRoutePoint(from, fromPoint)}
        placeholder={t('create_field_from_placeholder_cargo')}
        onPress={() => setShowFromPicker(true)}
      />
      {errors.from ? <Text style={s.err}>⚠️ {errors.from}</Text> : null}

      <Field
        variant="dropdown"
        featherIcon="map-pin"
        label={t('toCountry')}
        value={displayRoutePoint(to, toPoint)}
        placeholder={t('create_field_to_placeholder_cargo')}
        onPress={() => setShowToPicker(true)}
      />
      {errors.to ? <Text style={s.err}>⚠️ {errors.to}</Text> : null}

      {/* Полноэкранный выбор города (inDrive-стиль): поиск + недавние +
          избранное + популярные + погранпереходы. */}
      <LocationPickerModal
        visible={showFromPicker}
        onClose={() => setShowFromPicker(false)}
        title={t('loc_from_title')}
        showGeo
        onSelect={(v, point) => {
          setFrom(v);
          setFromPoint(point || null);
          // Валюта по умолчанию — USD (валюта коридора Китай↔СНГ, решение
          // владельца). Умная подстановка по стране отправления оставлена для
          // РФ (RUB), пока клиент не выбрал валюту вручную; Китай остаётся в USD.
          if (!currencyTouched && point?.country) {
            const cc = { RU: 'RUB' }[String(point.country).toUpperCase()];
            if (cc) setCurrency(cc);
          }
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

      {/* Stage 42: Описание груза — inline TextInput всегда видимый.
          Раньше было через Field+overlay+picker, и пользователю
          казалось, что нужно обязательно выбрать вариант из списка.
          Теперь любой custom text сохраняется (сумки/гвозди/мешки/
          стройматериалы/etc), а suggestions — лишь подсказка. */}
      <View style={s.fieldBlock}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 }}>
          <Feather name="package" size={14} color={v1.textMuted} />
          <Text style={[s.label, { marginBottom: 0, marginLeft: 0 }]}>{t('cargoDesc')}</Text>
        </View>
        <CargoTypeInput
          value={cargoDesc}
          onChange={(v) => {
            setCargoDesc(v);
            if (errors.cargoDesc) setErrors((e) => ({ ...e, cargoDesc: null }));
          }}
          placeholder={t('create_field_desc_placeholder')}
          testID="cargo-desc-input"
        />
      </View>
      {errors.cargoDesc ? <Text style={s.err}>⚠️ {errors.cargoDesc}</Text> : null}

      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            featherIcon="truck"
            label={t('truckType')}
            value={truckType ? t(truckType) : ''}
            onPress={() => setShowTruckPicker((v) => !v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            variant="dropdown"
            featherIcon="calendar"
            label={t('pickupDate')}
            value={pickupDate}
            onPress={() => setShowDatePicker((v) => !v)}
          />
        </View>
      </View>
      <BottomSheet visible={showTruckPicker} onClose={() => setShowTruckPicker(false)} title={t('truckType')}>
        <TruckTypeGrid
          value={truckType}
          accent={accent.main}
          onSelect={(k) => { setTruckType(k); if (errors.truckType) setErrors((e) => ({ ...e, truckType: null })); setShowTruckPicker(false); }}
        />
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
            // PR-A re-apply (P0-1): выше уже есть Field-row «Дата загрузки»
            // как trigger. defaultOpen=true говорит DatePicker'у: сразу
            // открыть Modal с календарём и не рендерить второй preview-row
            // «📅 ДД.ММ.ГГГГ» под Field'ом — иначе пользователь видит
            // две строки даты.
            defaultOpen
            // PR-C2: если пользователь закрыл модалку без выбора (tap по
            // overlay), снимаем trigger-флаг родителя — иначе обёртка
            // `<View style={s.pickerWrap}>` остаётся в layout и
            // пользователь видит пустой подсвеченный блок.
            onClose={() => setShowDatePicker(false)}
          />
        </View>
      ) : null}
      {errors.truckType ? <Text style={s.err}>⚠️ {errors.truckType}</Text> : null}
      {errors.pickupDate ? <Text style={s.err}>⚠️ {errors.pickupDate}</Text> : null}

      {/* Stage 27: placeholder "—" заменён на пример числа,
          label несёт единицу измерения ("Вес, т" / "Объём, м³").
          Раньше пользователь видел два пустых поля без подсказки —
          непонятно, где вес, где кубатура. */}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('weight_label')}
            value={tons}
            onChangeText={(v) => { setTons(normalizeDecimal(v)); if (errors.weight) setErrors((e) => ({ ...e, weight: null })); }}
            keyboardType="decimal-pad"
            placeholder={examplePlaceholder(t('weight_placeholder'), '22')}
            testID="cargo-weight-field"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('volume_label')}
            value={m3}
            onChangeText={(v) => { setM3(normalizeDecimal(v)); if (errors.weight) setErrors((e) => ({ ...e, weight: null })); }}
            keyboardType="decimal-pad"
            placeholder={examplePlaceholder(t('volume_placeholder'), '110')}
            testID="cargo-volume-field"
          />
        </View>
      </View>
      {errors.weight ? <Text style={s.err}>⚠️ {errors.weight}</Text> : null}

      {/* Цена обязательна: клиент всегда указывает стартовую сумму — от неё
          перевозчики торгуются. «Жду предложений»/«По договорённости» убраны. */}
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
              testID="cargo-price-field"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              variant="dropdown"
              featherIcon="dollar-sign"
              label={t('currency_label')}
              value={currency}
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
              onPress={() => { setCurrency(c.k); setCurrencyTouched(true); setShowCurrencyPicker(false); }}
              style={[s.currencyChip, currency === c.k ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
            >
              <Text style={[s.currencyText, { color: currency === c.k ? '#0A0A0A' : v1.textMuted }]}>{c.k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Тип оплаты — важный параметр решения водителя. Опционально. */}
      <View style={[s.priceCard, { borderColor: v1.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Feather name="credit-card" size={15} color={v1.text} />
          <Text style={[s.priceLabel, { marginBottom: 0 }]}>{t('payment_type_label')}</Text>
        </View>
        <View style={s.priceModeRow}>
          {[['cashless', t('pay_cashless')], ['cash', t('pay_cash')], ['any', t('pay_any')]].map(([k, lbl]) => (
            <TouchableOpacity
              key={k}
              style={[s.priceMode, paymentType === k ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
              onPress={() => setPaymentType(paymentType === k ? '' : k)}
              testID={`cargo-pay-${k}`}
            >
              <Text style={[s.priceModeText, { color: paymentType === k ? '#0A0A0A' : v1.textMuted }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

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

      {/* PR-C1: Textarea «Комментарий» удалён — backend cargos schema
          не имеет поля comment, значение молча терялось. См. comment
          вверху файла. */}

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
        style={{ marginTop: v1Spacing.sm, minHeight: 52, borderRadius: 14 }}
      />
      {/* «Сохранить черновик» убран (2026-06-13): кнопка только тостила
          feature_coming_soon — мёртвое действие на экране публикации. Вернём,
          когда черновики будут реально сохраняться. */}
    </Screen>
  );
}
