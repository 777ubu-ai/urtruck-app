// TruckParamsScreen — Экран «Параметры фуры» (шаг 4/4 PRO-flow, ТЗ §6).
//
// Динамические поля (НЕ хардкод): тоннаж и объём вводятся вручную (Number),
// 25 т / 86 м³ — только примеры в placeholder. Валидация: тоннаж 1..60 т,
// объём > 0 м³. Тип ТС + тип кузова — селекторы из truckConstants. Марка/
// модель — picker'ы из справочника TRUCK_BRANDS (searchTruckBrands /
// modelsForBrand), цвет — picker из VEHICLE_COLORS. Если тип ТС —
// тягач/контейнеровоз, открывается блок прицепа (госномер + фото техпаспорта
// прицепа). Данные уходят в PATCH /api/v1/driver/registration/draft.

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import {
  VEHICLE_TYPES,
  BODY_TYPES,
  TYPES_WITH_TRAILER,
  searchTruckBrands,
  modelsForBrand,
} from '../../utils/truckConstants';
import { brand, radius, typography } from '../../theme/brandV2';

// Канонический PRO-flow = 4 экрана: Identity → Selfie → VehicleDocs →
// этот экран → submit. Финальный шаг 4/4 (PR-V3 добавил Identity+Selfie).
const TOTAL_STEPS = 4;
const STEP = 4;

// Цвета кузова/кабины. key → i18n t('truck_color_<key>'); hex — образец
// (swatch). 'other' без образца (свободный выбор «другой»).
const VEHICLE_COLORS = [
  { key: 'white', hex: '#FFFFFF' },
  { key: 'black', hex: '#111827' },
  { key: 'gray', hex: '#6B7280' },
  { key: 'silver', hex: '#C0C5CE' },
  { key: 'red', hex: '#DC2626' },
  { key: 'blue', hex: '#2563EB' },
  { key: 'green', hex: '#16A34A' },
  { key: 'yellow', hex: '#EAB308' },
  { key: 'other', hex: null },
];
const colorHex = (k) => (VEHICLE_COLORS.find((c) => c.key === k) || {}).hex;

// Числовой ввод: оставляем только цифры и одну точку/запятую → число.
const parseNum = (s) => {
  const cleaned = String(s).replace(',', '.').replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

export default function TruckParamsScreen({ navigation, route }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [vehicleType, setVehicleType] = useState(route?.params?.vehicleType || null);
  const [bodyType, setBodyType] = useState(null);
  // Марка/модель/цвет — справочник TRUCK_BRANDS (PR-V5). brandName может быть
  // предзаполнен распознанным значением, если шаг документов его прокинул.
  const [brandName, setBrandName] = useState(route?.params?.brand || null);
  const [modelName, setModelName] = useState(route?.params?.model || null);
  const [colorKey, setColorKey] = useState(null);
  const [sheet, setSheet] = useState(null); // null | 'brand' | 'model' | 'color'
  const [brandQuery, setBrandQuery] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [volume, setVolume] = useState('');
  const [dimL, setDimL] = useState('');
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [adr, setAdr] = useState(false);
  const [straps, setStraps] = useState(false);
  const [trailerPlate, setTrailerPlate] = useState(route?.params?.plate || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const showTrailer = useMemo(
    () => TYPES_WITH_TRAILER.includes(vehicleType),
    [vehicleType],
  );

  const brandList = useMemo(() => searchTruckBrands(brandQuery), [brandQuery]);
  const brandModels = useMemo(() => (brandName ? modelsForBrand(brandName) : []), [brandName]);

  const validate = () => {
    const e = {};
    if (!vehicleType) e.vehicleType = t('truck_params_err_type');
    const tons = parseNum(tonnage);
    if (tons == null || tons < 1 || tons > 60) e.tonnage = t('truck_params_err_tonnage');
    const vol = parseNum(volume);
    if (vol == null || vol <= 0) e.volume = t('truck_params_err_volume');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    truck_kind: vehicleType,
    body_type: bodyType,
    capacity_tons: parseNum(tonnage),
    volume_m3: parseNum(volume),
    dims_l_m: parseNum(dimL),
    dims_w_m: parseNum(dimW),
    dims_h_m: parseNum(dimH),
    adr,
    has_straps: straps,
    // Марка/модель/цвет — пишем только при выборе, чтобы не затирать
    // распознанные OCR-значения (vehicle_brand/model уже в draft из шага
    // документов). vehicle_color пока не в backend-whitelist — отправляем,
    // backend безопасно игнорирует до добавления колонки.
    ...(brandName ? { vehicle_brand: brandName } : {}),
    ...(modelName ? { vehicle_model: modelName } : {}),
    ...(colorKey ? { vehicle_color: colorKey } : {}),
    ...(showTrailer && trailerPlate ? { vehicle_plate: trailerPlate.trim() } : {}),
  });

  const onSave = async () => {
    if (!validate()) {
      toast(t('val_fix_fields'), 'error');
      return;
    }
    setSaving(true);
    const res = await regAPI.saveDriverDraft(buildPayload());
    if (!res.ok) {
      setSaving(false);
      toast(t('save_error'), 'error');
      return;
    }
    // Финальный шаг сквозной верификации: отправляем заявку на проверку и
    // возвращаемся в приложение. Иначе (standalone/редактирование) — назад.
    if (route?.params?.fromVerification) {
      await regAPI.submitDriverRegistration();
      setSaving(false);
      toast(t('truck_params_submitted'), 'success');
      navigation.navigate('Main');
      return;
    }
    setSaving(false);
    toast(t('truck_params_saved'), 'success');
    if (navigation.canGoBack()) navigation.goBack();
  };

  const Selector = ({ items, value, onSelect, prefix }) => (
    <View style={s.chipsWrap}>
      {items.map((key) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(active ? null : key)}
            style={[s.chip, active && s.chipActive]}
            testID={`tp-${prefix}-${key}`}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>{t(`${prefix}_${key}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Поле-picker (марка/модель/цвет): показывает выбор или placeholder.
  const PickerField = ({ value, placeholder, onPress, disabled, swatch, testID }) => (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[s.picker, disabled && s.pickerDisabled]}
      testID={testID}
    >
      <View style={s.pickerLeft}>
        {swatch !== undefined && swatch !== null ? (
          <View style={[s.swatch, { backgroundColor: swatch }]} />
        ) : null}
        <Text style={[s.pickerText, !value && s.pickerPlaceholder]}>
          {value || placeholder}
        </Text>
      </View>
      <Feather name="chevron-down" size={18} color={brand.textSecondary} />
    </Pressable>
  );

  const progress = STEP / TOTAL_STEPS;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="truck-params-screen">
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn} testID="tp-back">
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </Pressable>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={s.stepLabel}>{t('truck_params_step')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t('truck_params_title')}</Text>

        {/* Тип ТС */}
        <Text style={s.label}>{t('truck_params_vehicle_type')}</Text>
        <Selector items={VEHICLE_TYPES} value={vehicleType} onSelect={setVehicleType} prefix="vt" />
        {errors.vehicleType ? <Text style={s.err}>{errors.vehicleType}</Text> : null}

        {/* Тип кузова */}
        <Text style={s.label}>{t('truck_params_body_type')}</Text>
        <Selector items={BODY_TYPES} value={bodyType} onSelect={setBodyType} prefix="bt" />

        {/* Марка (picker + поиск) */}
        <Text style={s.label}>{t('truck_params_brand')}</Text>
        <PickerField
          value={brandName}
          placeholder={t('truck_params_brand_select')}
          onPress={() => { setBrandQuery(''); setSheet('brand'); }}
          testID="tp-brand"
        />

        {/* Модель (зависит от марки) */}
        <Text style={s.label}>{t('truck_params_model')}</Text>
        <PickerField
          value={modelName}
          placeholder={brandName ? t('truck_params_model_select') : t('truck_params_model_first_brand')}
          onPress={() => setSheet('model')}
          disabled={!brandName}
          testID="tp-model"
        />

        {/* Цвет */}
        <Text style={s.label}>{t('truck_params_color')}</Text>
        <PickerField
          value={colorKey ? t(`truck_color_${colorKey}`) : null}
          placeholder={t('truck_params_color_select')}
          onPress={() => setSheet('color')}
          swatch={colorKey ? colorHex(colorKey) : null}
          testID="tp-color"
        />

        {/* Грузоподъёмность (динамический ввод) */}
        <Text style={s.label}>{t('truck_params_tonnage')}</Text>
        <TextInput
          value={tonnage}
          onChangeText={setTonnage}
          keyboardType="numeric"
          placeholder={t('truck_params_tonnage_ph')}
          placeholderTextColor={brand.textTertiary}
          style={[s.input, errors.tonnage && s.inputErr]}
          testID="tp-tonnage"
        />
        {errors.tonnage ? <Text style={s.err}>{errors.tonnage}</Text> : null}

        {/* Объём (динамический ввод) */}
        <Text style={s.label}>{t('truck_params_volume')}</Text>
        <TextInput
          value={volume}
          onChangeText={setVolume}
          keyboardType="numeric"
          placeholder={t('truck_params_volume_ph')}
          placeholderTextColor={brand.textTertiary}
          style={[s.input, errors.volume && s.inputErr]}
          testID="tp-volume"
        />
        {errors.volume ? <Text style={s.err}>{errors.volume}</Text> : null}

        {/* Габариты (необязательно) */}
        <Text style={s.label}>{t('truck_params_dims')}</Text>
        <View style={s.dimsRow}>
          <TextInput value={dimL} onChangeText={setDimL} keyboardType="numeric" placeholder={t('truck_params_dim_l')} placeholderTextColor={brand.textTertiary} style={[s.input, s.dimInput]} testID="tp-dim-l" />
          <TextInput value={dimW} onChangeText={setDimW} keyboardType="numeric" placeholder={t('truck_params_dim_w')} placeholderTextColor={brand.textTertiary} style={[s.input, s.dimInput]} testID="tp-dim-w" />
          <TextInput value={dimH} onChangeText={setDimH} keyboardType="numeric" placeholder={t('truck_params_dim_h')} placeholderTextColor={brand.textTertiary} style={[s.input, s.dimInput]} testID="tp-dim-h" />
        </View>

        {/* Блок прицепа — только для тягача/контейнеровоза */}
        {showTrailer ? (
          <View style={s.trailerBox} testID="tp-trailer-block">
            <Text style={s.trailerTitle}>🚛 {t('truck_params_trailer')}</Text>
            <Text style={s.label}>{t('truck_params_trailer_plate')}</Text>
            <TextInput
              value={trailerPlate}
              onChangeText={setTrailerPlate}
              autoCapitalize="characters"
              placeholder={t('truck_params_trailer_plate_ph')}
              placeholderTextColor={brand.textTertiary}
              style={s.input}
              testID="tp-trailer-plate"
            />
            <Pressable style={s.photoSlot} testID="tp-trailer-techpass">
              <Feather name="camera" size={20} color={brand.textSecondary} />
              <Text style={s.photoSlotText}>{t('truck_params_trailer_techpass')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Переключатели */}
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>{t('truck_params_adr')}</Text>
          <Switch value={adr} onValueChange={setAdr} testID="tp-adr" trackColor={{ true: brand.primary }} />
        </View>
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>{t('truck_params_straps')}</Text>
          <Switch value={straps} onValueChange={setStraps} testID="tp-straps" trackColor={{ true: brand.primary }} />
        </View>
      </ScrollView>

      <View style={s.ctaWrap}>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[s.cta, saving && { opacity: 0.6 }]}
          testID="tp-save"
        >
          <Text style={s.ctaText}>{t('truck_params_save')}</Text>
        </Pressable>
      </View>

      {/* Bottom-sheet выбора марки / модели / цвета */}
      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setSheet(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />

            {sheet === 'brand' ? (
              <>
                <TextInput
                  value={brandQuery}
                  onChangeText={setBrandQuery}
                  placeholder={t('truck_params_brand_search')}
                  placeholderTextColor={brand.textTertiary}
                  style={s.sheetSearch}
                  autoFocus
                  testID="tp-brand-search"
                />
                <ScrollView keyboardShouldPersistTaps="handled" style={s.sheetList}>
                  {brandList.map((b) => (
                    <Pressable
                      key={b.name}
                      style={s.sheetRow}
                      onPress={() => { setBrandName(b.name); setModelName(null); setSheet(null); }}
                      testID={`tp-brand-opt-${b.name}`}
                    >
                      <Text style={s.sheetRowText}>{b.name}</Text>
                      {brandName === b.name ? <Feather name="check" size={18} color={brand.primary} /> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {sheet === 'model' ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={s.sheetList}>
                {brandModels.map((m) => (
                  <Pressable
                    key={m}
                    style={s.sheetRow}
                    onPress={() => { setModelName(m); setSheet(null); }}
                    testID={`tp-model-opt-${m}`}
                  >
                    <Text style={s.sheetRowText}>{m}</Text>
                    {modelName === m ? <Feather name="check" size={18} color={brand.primary} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {sheet === 'color' ? (
              <ScrollView style={s.sheetList}>
                {VEHICLE_COLORS.map((c) => (
                  <Pressable
                    key={c.key}
                    style={s.sheetRow}
                    onPress={() => { setColorKey(c.key); setSheet(null); }}
                    testID={`tp-color-opt-${c.key}`}
                  >
                    <View style={s.pickerLeft}>
                      <View style={[s.swatch, c.hex ? { backgroundColor: c.hex } : s.swatchOther]} />
                      <Text style={s.sheetRowText}>{t(`truck_color_${c.key}`)}</Text>
                    </View>
                    {colorKey === c.key ? <Feather name="check" size={18} color={brand.primary} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand.primary },
  stepLabel: { ...typography.bodySmall, color: brand.textSecondary },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { ...typography.h1, color: brand.textPrimary, marginBottom: 16 },
  label: { ...typography.bodySmall, fontWeight: '700', color: brand.textPrimary, marginTop: 18, marginBottom: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  chipActive: { borderColor: brand.primary, backgroundColor: brand.primarySoft },
  chipText: { ...typography.bodySmall, color: brand.textSecondary },
  chipTextActive: { color: brand.primary, fontWeight: '700' },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, color: brand.textPrimary, ...typography.body },
  inputErr: { borderColor: brand.danger || '#EF4444' },
  // picker-поле (марка/модель/цвет)
  picker: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickerDisabled: { opacity: 0.5 },
  pickerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  pickerText: { ...typography.body, color: brand.textPrimary, flexShrink: 1 },
  pickerPlaceholder: { color: brand.textTertiary },
  swatch: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: brand.border },
  swatchOther: { backgroundColor: brand.surfaceMuted },
  dimsRow: { flexDirection: 'row', gap: 10 },
  dimInput: { flex: 1, textAlign: 'center' },
  trailerBox: { marginTop: 18, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surfaceMuted },
  trailerTitle: { ...typography.bodyLarge, fontWeight: '800', color: brand.textPrimary },
  photoSlot: { marginTop: 10, height: 56, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: brand.surface },
  photoSlotText: { ...typography.bodySmall, color: brand.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  toggleLabel: { ...typography.body, color: brand.textPrimary, flex: 1 },
  err: { ...typography.caption, color: brand.danger || '#EF4444', marginTop: 6 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
  // bottom-sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', backgroundColor: brand.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: brand.border, marginBottom: 12 },
  sheetSearch: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 14, color: brand.textPrimary, ...typography.body, marginBottom: 8 },
  sheetList: { flexGrow: 0 },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: brand.surfaceMuted },
  sheetRowText: { ...typography.body, color: brand.textPrimary },
});
