import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackButton from '../../components/ui/v1/BackButton';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import { KeyboardSafeScrollView } from '../../components/ui/v1/KeyboardSafeLayout';
import {
  CountrySheet,
  OptionSheet,
  SelectRow,
  countryLabel,
  styles,
  useVehicleCopy,
} from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { storage } from '../../utils/storage';
import { useI18n } from '../../utils/useI18n';
import { vehicleAPI } from '../../utils/vehicleAPI';

const KEY = 'ur_vehicle_setup_draft';
const TYPES = ['tractor_semitrailer', 'solo_truck', 'light_truck', 'road_train', 'container_truck', 'dump_truck', 'car_carrier', 'lowboy', 'tanker', 'other'];
const BODIES = {
  tractor_semitrailer: ['curtain_sider', 'refrigerated', 'insulated', 'flatbed', 'container_platform', 'tanker', 'lowboy', 'other'],
  solo_truck: ['curtain_sider', 'refrigerated', 'insulated', 'flatbed', 'dump_body', 'van', 'other'],
  light_truck: ['curtain_sider', 'van', 'flatbed', 'other'],
  road_train: ['curtain_sider', 'refrigerated', 'insulated', 'container_platform', 'other'],
  container_truck: ['container_platform'],
  dump_truck: ['dump_body'],
  car_carrier: ['car_carrier'],
  lowboy: ['lowboy'],
  tanker: ['tanker'],
  other: ['other'],
};
const MODELS = {
  Volvo: ['FH', 'FM', 'FMX'],
  Mercedes_Benz: ['Actros', 'Atego', 'Arocs'],
  Scania: ['R-series', 'S-series', 'P-series'],
  MAN: ['TGX', 'TGS', 'TGM'],
  DAF: ['XF', 'XG', 'CF'],
  Iveco: ['S-Way', 'Stralis', 'Daily'],
  KAMAZ: ['5490', '6520'],
  HOWO: ['TX', 'ZZ'],
  FAW: ['J6', 'JH6'],
};
const MAKES = ['Volvo', 'Mercedes_Benz', 'Scania', 'MAN', 'DAF', 'Iveco', 'KAMAZ', 'HOWO', 'FAW', 'Other'];
const EMPTY_DRAFT = {
  driver_citizenship_country_code: '',
  vehicle_registration_country_code: '',
  vehicle_type: '',
  body_type: '',
  make: '',
  make_custom: '',
  model: '',
  model_custom: '',
  license_plate: '',
  payload_tons: '',
  cargo_volume_m3: '',
};
const decimal = (value) => String(value || '')
  .replace(',', '.')
  .replace(/[^\d.]/g, '')
  .replace(/(\..*)\./g, '$1');

export default function VehicleSetupCountryScreen({ navigation, route }) {
  const { lang, c } = useVehicleCopy();
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const shouldRestore = Boolean(route?.params?.vehicleId || route?.params?.preserveDraft);
      let local = shouldRestore ? JSON.parse((await storage.get(KEY)) || '{}') : {};
      if (!shouldRestore) await storage.remove(KEY);
      if (route?.params?.vehicleId) {
        const status = await regAPI.status().catch(() => null);
        if (status?.driver_citizenship_country_code) {
          local = {
            ...local,
            driver_citizenship_country_code: status.driver_citizenship_country_code,
          };
        }
      }
      if (mounted) {
        setDraft({ ...EMPTY_DRAFT, ...local });
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [route?.params?.preserveDraft, route?.params?.vehicleId]);

  const saveDraft = async (next) => {
    setDraft(next);
    await storage.set(KEY, JSON.stringify(next));
    if (error) setError('');
  };
  const setValue = (key, value) => saveDraft({ ...draft, [key]: value });
  const setValues = (values) => saveDraft({ ...draft, ...values });
  const options = (values, labels, icon) => values.map((value) => ({ value, label: labels[value], icon }));
  const typeOptions = useMemo(() => options(TYPES, c.types, 'truck'), [c.types]);
  const bodyOptions = useMemo(() => options(BODIES[draft.vehicle_type] || [], c.bodies, 'box'), [c.bodies, draft.vehicle_type]);
  const makeOptions = useMemo(() => options(MAKES, c.makes, 'settings'), [c.makes]);
  const otherMake = c.otherMake || c.makes.Other;
  const otherModel = c.otherModel || ({ RU: 'Другая модель', ZH: '其他型号', KK: 'Басқа модель', EN: 'Other model' }[lang] || 'Other model');
  const modelOptions = useMemo(() => [
    ...(MODELS[draft.make] || []).map((value) => ({ value, label: value, icon: 'truck' })),
    ...(draft.make ? [{ value: 'Other', label: otherModel, icon: 'edit-3' }] : []),
  ], [draft.make, otherModel]);

  const required = [
    'driver_citizenship_country_code',
    'vehicle_registration_country_code',
    'vehicle_type',
    'body_type',
    'make',
    'model',
    'license_plate',
    'payload_tons',
    'cargo_volume_m3',
  ];
  const incomplete = required.some((key) => !String(draft[key] ?? '').trim())
    || (draft.make === 'Other' && !String(draft.make_custom ?? '').trim())
    || (draft.model === 'Other' && !String(draft.model_custom ?? '').trim())
    || !(Number(draft.payload_tons) > 0)
    || !(Number(draft.cargo_volume_m3) > 0);

  const handleAuthFailure = (result) => {
    if (!result?.authRequired) return false;
    const message = result.detail || t('session_expired');
    setError(message);
    Alert.alert('', message, [{ text: 'OK', onPress: () => signOut() }]);
    return true;
  };

  const save = async () => {
    if (saving || incomplete) return;
    setSaving(true);
    setError('');
    const make = draft.make === 'Other' ? draft.make_custom.trim() : draft.make;
    const model = draft.model === 'Other' ? draft.model_custom.trim() : draft.model;
    const payload = {
      vehicle_registration_country_code: draft.vehicle_registration_country_code,
      vehicle_type: draft.vehicle_type,
      body_type: draft.body_type,
      make,
      model,
      license_plate: draft.license_plate.trim().toUpperCase(),
      payload_tons: Number(draft.payload_tons),
      cargo_volume_m3: Number(draft.cargo_volume_m3),
      cargo_length_m: null,
      cargo_width_m: null,
      cargo_height_m: null,
    };
    try {
      const result = await vehicleAPI.save(payload, route?.params?.vehicleId);
      if (handleAuthFailure(result)) return;
      if (!result?.ok) {
        setError(result?.detail || c.saveError);
        return;
      }
      const draftSaved = await regAPI.saveDriverDraft({
        citizenship_country: draft.driver_citizenship_country_code,
        driver_citizenship_country_code: draft.driver_citizenship_country_code,
        vehicle_registration_country: draft.vehicle_registration_country_code,
        vehicle_registration_country_code: draft.vehicle_registration_country_code,
        truck_kind: draft.vehicle_type,
        vehicle_type: draft.vehicle_type,
        body_type: draft.body_type,
        vehicle_brand: make,
        vehicle_model: model,
        vehicle_plate: payload.license_plate,
        capacity_tons: payload.payload_tons,
        volume_m3: payload.cargo_volume_m3,
      });
      if (handleAuthFailure(draftSaved)) return;
      if (!draftSaved?.ok) {
        setError(draftSaved?.detail || c.saveError);
        return;
      }
      navigation.replace('VehicleSetupSuccess', {
        ...route?.params,
        vehicle: result.vehicle,
      });
    } catch {
      setError(c.saveErrorSub);
    } finally {
      setSaving(false);
    }
  };

  const input = (key, props = {}) => (
    <TextInput
      {...props}
      value={String(draft[key] || '')}
      onChangeText={props.onChangeText || ((value) => setValue(key, value))}
      placeholderTextColor="#728096"
      style={[styles.input, { minHeight: 64 }, props.style]}
    />
  );
  const selectMake = (value) => setValues({ make: value, make_custom: '', model: '', model_custom: '' });
  const selectModel = (value) => setValues({ model: value, model_custom: '' });

  if (loading) {
    return <SafeAreaView style={styles.safe}><DriverRouteBackdrop /><ActivityIndicator color={DRIVER_CERAMIC.active} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="vehicle-setup-single-screen">
    <DriverRouteBackdrop />
    <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
      <BackButton onPress={() => navigation.goBack()} label={c.back} />
    </View>
    <KeyboardSafeScrollView contentContainerStyle={[styles.scroll, { gap: 12, paddingTop: 12 }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { marginBottom: 22 }]}>{c.addVehicle}</Text>
      <View style={styles.row}>
        <View style={styles.fieldCell}>
          <SelectRow countryCode={draft.driver_citizenship_country_code} value={countryLabel(draft.driver_citizenship_country_code, lang)} placeholder={c.citizenship} onPress={() => setSheet('citizenship')} testID="vehicle-citizenship-selector" />
        </View>
        <View style={styles.fieldCell}>
          <SelectRow countryCode={draft.vehicle_registration_country_code} value={countryLabel(draft.vehicle_registration_country_code, lang)} placeholder={c.registrationShort || c.registration} onPress={() => setSheet('registration')} testID="vehicle-registration-selector" />
        </View>
      </View>
      <SelectRow icon="truck" value={draft.vehicle_type ? c.types[draft.vehicle_type] : ''} placeholder={c.transport} onPress={() => setSheet('type')} testID="vehicle-type-selector" />
      <SelectRow icon="box" value={draft.body_type ? c.bodies[draft.body_type] : ''} placeholder={c.body} onPress={() => draft.vehicle_type && setSheet('body')} testID="vehicle-body-selector" />
      <View style={styles.row}>
        <View style={styles.fieldCell}>
          <SelectRow icon="settings" value={draft.make === 'Other' ? draft.make_custom : (draft.make ? c.makes[draft.make] : '')} placeholder={c.make} onPress={() => setSheet('make')} testID="vehicle-make-selector" />
        </View>
        <View style={styles.fieldCell}>
          <SelectRow icon="truck" value={draft.model === 'Other' ? draft.model_custom : draft.model} placeholder={c.model} onPress={() => draft.make && setSheet('model')} testID="vehicle-model-selector" />
        </View>
      </View>
      {draft.make === 'Other' ? input('make_custom', { placeholder: otherMake, testID: 'vehicle-make-manual' }) : null}
      {draft.model === 'Other' ? input('model_custom', { placeholder: otherModel, testID: 'vehicle-model-manual' }) : null}
      {input('license_plate', { placeholder: c.plate, autoCapitalize: 'characters', testID: 'vehicle-license-plate', onChangeText: (value) => setValue('license_plate', value.toUpperCase()) })}
      <View style={styles.row}>
        <View style={styles.fieldCell}>
          {input('payload_tons', { placeholder: c.payloadShort || c.payload, keyboardType: 'decimal-pad', testID: 'vehicle-payload', onChangeText: (value) => setValue('payload_tons', decimal(value)) })}
        </View>
        <View style={styles.fieldCell}>
          {input('cargo_volume_m3', { placeholder: c.volumeShort || c.volume, keyboardType: 'decimal-pad', testID: 'vehicle-volume', onChangeText: (value) => setValue('cargo_volume_m3', decimal(value)) })}
        </View>
      </View>
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}
    </KeyboardSafeScrollView>
    <View style={styles.footer}>
      <Pressable disabled={incomplete || saving} onPress={save} style={[styles.cta, (incomplete || saving) && styles.ctaDisabled]} testID="vehicle-save">
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.ctaText, incomplete && styles.disabledText]}>{c.saveVehicle || c.saveOnly}</Text>}
      </Pressable>
    </View>
    <CountrySheet visible={sheet === 'citizenship'} title={c.citizenshipSheet} onClose={() => setSheet(null)} onSelect={(iso) => setValue('driver_citizenship_country_code', iso)} />
    <CountrySheet visible={sheet === 'registration'} title={c.registrationSheet} onClose={() => setSheet(null)} onSelect={(iso) => setValue('vehicle_registration_country_code', iso)} />
    <OptionSheet visible={sheet === 'type'} title={c.transport} options={typeOptions} value={draft.vehicle_type} onClose={() => setSheet(null)} onSelect={(value) => setValues({ vehicle_type: value, body_type: '' })} />
    <OptionSheet visible={sheet === 'body'} title={c.body} options={bodyOptions} value={draft.body_type} onClose={() => setSheet(null)} onSelect={(value) => setValue('body_type', value)} />
    <OptionSheet visible={sheet === 'make'} title={c.makeSheet} options={makeOptions} fallbackOption={{ value: 'Other', label: otherMake }} value={draft.make} search hideIcons onClose={() => setSheet(null)} onSelect={selectMake} />
    <OptionSheet visible={sheet === 'model'} title={c.modelSheet} options={modelOptions} fallbackOption={{ value: 'Other', label: otherModel }} value={draft.model} search onClose={() => setSheet(null)} onSelect={selectModel} />
  </SafeAreaView>;
}
