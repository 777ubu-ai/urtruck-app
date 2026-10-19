import { usePublicationDraft } from '../hooks/usePublicationDraft';
import { sessionRole, confirmPublicationSession } from '../utils/publicationSession';
import { regAPI } from '../utils/registration';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { cleanPlaceName, localizePlace } from '../utils/places';
import CountryFlag from '../components/ui/v1/CountryFlag';
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
import StickyCTABar from '../components/ui/v1/StickyCTABar';
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
//   - on success → reset to Main/MyWork so the canonical bottom navigation stays visible
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

// Дробный ввод (вес/объём): запятую→точку, только цифры и одна точка (31.5 т).
const normalizeDecimal = (v) => {
  let s = String(v || '').replace(',', '.').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
};
const vehicleBodyToMarketType = (body) => ({ curtain_sider: 'tent', refrigerated: 'ref', insulated: 'izoterm', flatbed: 'platform', container_platform: 'platform', dump_body: 'dump_truck', tanker: 'tanker', lowboy: 'platform', car_carrier: 'auto', van: 'van' }[body] || body);

export default function CreateTripScreen({ navigation, route }) {
  const { session, refreshLevel } = useAuth();
  const role = sessionRole(session);
  const ownerRef = React.useRef(session?.user?.id);
  const sessionRef = React.useRef(session);
  sessionRef.current = session;
  const mountedRef = React.useRef(true);
  React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
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

  const accent = v1AccentFor('driver');
  const { t, lang } = useI18n();
  const { toast } = useToast();


  const displayRoutePoint = (raw, point) => {
    const canonical = point?.name || cleanPlaceName(raw || '');
    const localized = localizePlace(canonical, lang) || canonical;
    return localized;
  };

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
  const vehicle = route?.params?.vehicle;

  // Сохранённая машина подставляется один раз при открытии публикации.
  React.useEffect(() => {
    if (!vehicle) return;
    setTruckType(vehicleBodyToMarketType(vehicle.body_type || vehicle.vehicle_type || null));
    setTons(vehicle.payload_tons != null ? String(vehicle.payload_tons) : '');
    setM3(vehicle.cargo_volume_m3 != null ? String(vehicle.cargo_volume_m3) : '');
  }, [vehicle]);

  // City / date pickers reuse the existing standalone components: tapping
  // a Field row toggles the corresponding picker into a portal-like overlay.
  const [publicationConflict, setPublicationConflict] = useState(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showArrivalPicker, setShowArrivalPicker] = useState(false);
  const [showTruckPicker, setShowTruckPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const submissionInFlight = React.useRef(false);
  const draft = usePublicationDraft(`trip:${route?.params?.vehicleId || vehicle?.id || 'unbound'}`, ownerRef.current, { from, fromPoint, to, toPoint, transit, departure, arrival, truckType, tons, m3, price, currency }, { from: setFrom, fromPoint: setFromPoint, to: setTo, toPoint: setToPoint, transit: setTransit, departure: setDeparture, arrival: setArrival, truckType: setTruckType, tons: setTons, m3: setM3, price: setPrice, currency: setCurrency });

  const submit = async () => {
    if (submitting || submissionInFlight.current) return;
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
    submissionInFlight.current = true;
    setSubmitting(true);
    const priceNum = Math.max(0, parseInt(String(price || '').replace(/\s/g, ''), 10) || 0);
    let payload = {
      from_city: fromPoint?.name || cleanPlaceName(from.trim()),
      to_city: toPoint?.name || cleanPlaceName(to.trim()),
      transit: transit.trim() || null,
      truck_type: truckType,
      vehicle_id: route?.params?.vehicleId || vehicle?.id || null,
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
      await draft.save();
      const operation = await draft.prepare();
      const sessionGuard = await confirmPublicationSession({
        expectedRole: 'driver', expectedUserId: ownerRef.current,
        getSession: () => mountedRef.current ? sessionRef.current : null, readToken: () => regAPI.getToken(),
        readAccount: token => regAPI.publicationAccount(token),
      });
      if (operation.replayPayload) payload = operation.replayPayload;
      payload = await draft.snapshot(operation.clientId, payload);
      const r = await marketAPI.createTrip(payload, sessionGuard);
      if (r.ok || r.id) {
        if (await draft.clear(operation.clientId) === false) return;
        if (!sessionGuard.isCurrent() || await regAPI.getToken() !== sessionGuard.expectedToken || !sessionGuard.isCurrent()) return;
        toast('✓ ' + t('trip_published'), 'success', 4000);
        const justCreated = { id: r.id, ...payload, status: 'active', created_at: new Date().toISOString() };
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Main',
            params: {
              role,
              screen: 'MyWork',
              params: { role, initialTab: 'routes', justCreatedTrip: justCreated },
            },
          }],
        });
      } else {
        if (!sessionGuard.isCurrent() || await regAPI.getToken() !== sessionGuard.expectedToken || !sessionGuard.isCurrent()) return;
        if (r.code === 'PUBLICATION_IDEMPOTENCY_CONFLICT' && r.originalResult?.id) {
          setPublicationConflict({ clientId: operation.clientId, result: r.originalResult });
          toast(t('publication_content_conflict'), 'error', 6000);
        } else toast(r.detail || t('send_error'), 'error');
      }
    } catch (e) {
      // P1 UI-аудит 2026-09-13: не показывать сырой e.message (часто
      // непереведённая браузерная строка вроде "Failed to fetch") — только
      // локализованный текст, как во всех остальных catch-блоках рядом.
      if (!mountedRef.current || sessionRef.current?.user?.id !== ownerRef.current) return;
      if (e?.code === 'PUBLICATION_ROLE_NOT_ALLOWED') refreshLevel().catch(() => {});
      toast(t(e?.code === 'PUBLICATION_DRAFT_FAILED' ? 'publication_draft_save_failed' : e?.code === 'PUBLICATION_SESSION_CHANGED' ? 'session_expired' : e?.code === 'PUBLICATION_ROLE_NOT_ALLOWED' ? 'publication_role_trip' : e?.code === 'CARGO_PHOTO_UPLOAD_FAILED' ? 'photo_failed' : 'network_error'), 'error');
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const conflictActions = publicationConflict ? <View testID="publication-conflict">
    <Text accessibilityRole="alert">{t('publication_content_conflict')}</Text>
    <PrimaryButton testID="publication-open-original" disabled={submitting} label={t('publication_open_original')}
      onPress={() => { if (!submissionInFlight.current && sessionRef.current?.user?.id === ownerRef.current) navigation.navigate('TripDetail', { tripId: publicationConflict.result.id, role }); }} />
    <PrimaryButton testID="publication-new-operation" disabled={submitting} label={t('publication_new_operation')}
      onPress={async () => {
        if (submissionInFlight.current || sessionRef.current?.user?.id !== ownerRef.current || !mountedRef.current) return;
        submissionInFlight.current = true;
        setSubmitting(true);
        try {
          await draft.resetOperation(publicationConflict.clientId);
          if (mountedRef.current && sessionRef.current?.user?.id === ownerRef.current) setPublicationConflict(null);
        } catch { if (mountedRef.current && sessionRef.current?.user?.id === ownerRef.current) toast(t('publication_draft_save_failed'), 'error'); }
        finally { submissionInFlight.current = false; if (mountedRef.current) setSubmitting(false); }
      }} />
  </View> : null;

  if (role !== 'driver') {
    return <Screen><BrandHeader onBack={() => navigation.goBack()} />
      <Text accessibilityRole="alert">{t('publication_role_trip')}</Text>
      <PrimaryButton testID="publication-open-correct-role" label={t(role === 'driver' ? 'publish_route' : 'place_cargo')}
        onPress={() => navigation.navigate('Main', { role, screen: 'MyWork' })} />
    </Screen>;
  }

  if (!draft.ready) return <Screen><BrandHeader onBack={() => navigation.goBack()} /><Text>{t(draft.loadError ? 'publication_draft_load_failed' : 'my_work_loading')}</Text>
    {draft.loadError ? <PrimaryButton label={t('repeat_action')} testID="publication-draft-retry" onPress={draft.retry} /> : null}</Screen>;

  // Design v1 Commit 2: sticky footer CTA (same pattern as CreateCargoScreen)
  // — the submit button renders in Screen's `footer` slot, above the IME,
  // never inside the scroll content tree.
  return (
    <Screen
      contentStyle={{ paddingBottom: 24 }}
      footer={(
        <StickyCTABar>
          <PrimaryButton
            label={t('publish_trip_action')}
            onPress={submit}
            loading={submitting}
            accent="driver"
            testID="trip-submit-button"
            style={{ minHeight: 52, borderRadius: 14, alignSelf: 'stretch' }}
          />
        </StickyCTABar>
      )}
    >
      <BrandHeader onBack={() => navigation.goBack()} accent={accent.main} />

      {conflictActions}
      <Text style={s.title}>{t('postTrip')}</Text>
      <Text style={s.subtitle}>{t('create_trip_subtitle')}</Text>

      {/* Откуда / Куда: полноэкранный выбор города (inDrive-стиль). */}
      <Field
        variant="dropdown"
        featherIcon="map-pin"
        leading={fromPoint?.country ? <CountryFlag code={fromPoint.country} width={23} /> : null}
        label={t('signup_field_country')}
        value={displayRoutePoint(from, fromPoint)}
        placeholder={t('create_field_from_placeholder')}
        onPress={() => setShowFromPicker(true)}
      />
      {errors.from ? <Text style={s.err}>⚠️ {errors.from}</Text> : null}

      <Field
        variant="dropdown"
        featherIcon="map-pin"
        leading={toPoint?.country ? <CountryFlag code={toPoint.country} width={23} /> : null}
        label={t('toCountry')}
        value={displayRoutePoint(to, toPoint)}
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
            valueNumberOfLines={0}
            testID="trip-departure-field"
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

      {/* Пустые числовые поля: label уже объясняет единицу; label с
          единицей. Те же изменения, что в CreateCargoScreen. */}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('weight_label')}
            value={tons}
            onChangeText={(v) => setTons(normalizeDecimal(v))}
            keyboardType="decimal-pad"
            placeholder=""
            testID="trip-weight-field"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('volume_label')}
            value={m3}
            onChangeText={(v) => setM3(normalizeDecimal(v))}
            keyboardType="decimal-pad"
            placeholder=""
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
              testID={`trip-currency-${c.k}`}
              onPress={() => { setCurrency(c.k); setShowCurrencyPicker(false); }}
              style={[s.currencyChip, currency === c.k ? { backgroundColor: accent.main, borderColor: accent.main } : { borderColor: v1.border }]}
            >
              <Text style={[s.currencyText, { color: currency === c.k ? '#0A0A0A' : v1.textMuted }]}>{c.k}</Text>
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

      {/* Draft link — backend doesn't accept status='draft' yet, so this is
          a visual placeholder per the macro. */}
      <TouchableOpacity onPress={() => toast(t('feature_coming_soon'), 'info', 2500)} style={s.draftRow} activeOpacity={0.7}>
        <Text style={[s.draftText, { color: accent.main }]}>{t('create_route_save_draft')}</Text>
      </TouchableOpacity>
    </Screen>
  );
}
