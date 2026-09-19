import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { storage } from '../../utils/storage';
import { useVehicleCopy, ProgressHeader, SelectRow, Label, OptionSheet, styles } from '../../components/vehicle/VehicleSetupUI';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import { KeyboardSafeScrollView } from '../../components/ui/v1/KeyboardSafeLayout';

const KEY = 'ur_vehicle_setup_draft';
const TYPES = ['tractor_semitrailer', 'solo_truck', 'light_truck', 'road_train', 'container_truck', 'dump_truck', 'car_carrier', 'lowboy', 'tanker', 'other'];
const BODIES = { tractor_semitrailer: ['curtain_sider', 'refrigerated', 'insulated', 'flatbed', 'container_platform', 'tanker', 'lowboy', 'other'], solo_truck: ['curtain_sider', 'refrigerated', 'insulated', 'flatbed', 'dump_body', 'van', 'other'], light_truck: ['curtain_sider', 'van', 'flatbed', 'other'], road_train: ['curtain_sider', 'refrigerated', 'insulated', 'container_platform', 'other'], container_truck: ['container_platform'], dump_truck: ['dump_body'], car_carrier: ['car_carrier'], lowboy: ['lowboy'], tanker: ['tanker'], other: ['other'] };
const MODELS = { Volvo: ['FH', 'FM', 'FMX'], Mercedes_Benz: ['Actros', 'Atego', 'Arocs'], Scania: ['R-series', 'S-series', 'P-series'], MAN: ['TGX', 'TGS', 'TGM'], DAF: ['XF', 'XG', 'CF'], Iveco: ['S-Way', 'Stralis', 'Daily'], KAMAZ: ['5490', '6520'], HOWO: ['TX', 'ZZ'], FAW: ['J6', 'JH6'] };
const MAKES = ['Volvo', 'Mercedes_Benz', 'Scania', 'MAN', 'DAF', 'Iveco', 'KAMAZ', 'HOWO', 'FAW', 'Other'];
const decimal = (value) => String(value || '').replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

export default function VehicleSetupMachineScreen({ navigation, route }) {
  const { lang, c } = useVehicleCopy();
  const otherMake = c.otherMake || c.makes.Other;
  const otherModel = c.otherModel || ({ RU: 'Другая модель', ZH: '其他型号', KK: 'Басқа модель', EN: 'Other model' }[lang] || 'Other model');
  const [draft, setDraft] = useState({});
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { storage.get(KEY).then((raw) => setDraft(JSON.parse(raw || '{}'))); }, []);

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
  const modelOptions = useMemo(() => [
    ...(MODELS[draft.make] || []).map((value) => ({ value, label: value, icon: 'truck' })),
    ...(draft.make ? [{ value: 'Other', label: otherModel, icon: 'edit-3' }] : []),
  ], [draft.make, otherModel]);
  const required = ['vehicle_type', 'body_type', 'make', 'model', 'license_plate', 'payload_tons', 'cargo_volume_m3'];
  const incomplete = required.some((key) => !String(draft[key] ?? '').trim()) || (draft.make === 'Other' && !String(draft.make_custom ?? '').trim()) || (draft.model === 'Other' && !String(draft.model_custom ?? '').trim());
  const next = () => {
    const payload = Number(draft.payload_tons);
    const volume = Number(draft.cargo_volume_m3);
    if (incomplete || Number(draft.payload_tons) <= 0 || Number(draft.cargo_volume_m3) <= 0 || !Number.isFinite(payload) || !Number.isFinite(volume)) { setError(c.invalid); return; }
    navigation.navigate('VehicleSetupReview', { ...route?.params });
  };
  const input = (key, props = {}) => <TextInput {...props} value={String(draft[key] || '')} returnKeyType={props.returnKeyType || 'next'} blurOnSubmit={false} onChangeText={props.onChangeText || ((value) => setValue(key, value))} style={[styles.input, props.style]} />;
  const selectMake = (value) => setValues({ make: value, make_custom: '', model: '', model_custom: '' });
  const selectModel = (value) => setValues({ model: value, model_custom: '' });

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <DriverRouteBackdrop />
    <ProgressHeader navigation={navigation} step={2} c={c} />
    <KeyboardSafeScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{c.machine}</Text>
      <Text style={styles.subtitle}>{c.machineSub}</Text>
      <Label>{c.transport}</Label>
      <SelectRow icon="truck" value={draft.vehicle_type ? c.types[draft.vehicle_type] : ''} onPress={() => setSheet('type')} testID="vehicle-type-selector" />
      <Label>{c.body}</Label>
      <SelectRow icon="box" value={draft.body_type ? c.bodies[draft.body_type] : ''} onPress={() => draft.vehicle_type && setSheet('body')} testID="vehicle-body-selector" />
      <View style={styles.row}>
        <View style={styles.fieldCell}><Label>{c.make}</Label><SelectRow icon="settings" value={draft.make === 'Other' ? (draft.make_custom || c.makes.Other) : (draft.make ? c.makes[draft.make] : '')} onPress={() => setSheet('make')} testID="vehicle-make-selector" /></View>
        <View style={styles.fieldCell}><Label>{c.model}</Label><SelectRow icon="truck" value={draft.model === 'Other' ? (draft.model_custom || otherModel) : (draft.model || '')} onPress={() => draft.make && setSheet('model')} testID="vehicle-model-selector" /></View>
      </View>
      {draft.make === 'Other' ? input('make_custom', { placeholder: otherMake, placeholderTextColor: '#6B7A71', testID: 'vehicle-make-manual' }) : null}
      {draft.model === 'Other' ? input('model_custom', { placeholder: otherModel, placeholderTextColor: '#6B7A71', testID: 'vehicle-model-manual' }) : null}
      <Label>{c.plate}</Label>
      {input('license_plate', { autoCapitalize: 'characters', testID: 'vehicle-license-plate', onChangeText: (value) => setValue('license_plate', value.toUpperCase()), accessibilityLabel: c.plate })}
      <View style={styles.row}>
        <View style={styles.fieldCell}><Label>{c.payload}</Label>{input('payload_tons', { keyboardType: 'decimal-pad', testID: 'vehicle-payload', onChangeText: (value) => setValue('payload_tons', decimal(value)) })}</View>
        <View style={styles.fieldCell}><Label>{c.volume}</Label>{input('cargo_volume_m3', { keyboardType: 'decimal-pad', testID: 'vehicle-volume', onChangeText: (value) => setValue('cargo_volume_m3', decimal(value)) })}</View>
      </View>
      <Label optional={c.optional}>{c.extra}</Label>
      <View style={styles.dimensionGrid}>
        {[['cargo_length_m', c.length, 'vehicle-length'], ['cargo_width_m', c.width, 'vehicle-width'], ['cargo_height_m', c.height, 'vehicle-height']].map(([key, label, testID]) => <View key={key} style={styles.dimensionCell}><Label>{label}</Label>{input(key, { keyboardType: 'decimal-pad', testID, placeholder: '0', placeholderTextColor: '#6B7A71', accessibilityLabel: label, onChangeText: (value) => setValue(key, decimal(value)) })}</View>)}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </KeyboardSafeScrollView>
    <View style={styles.footer}><Pressable disabled={incomplete} onPress={next} style={[styles.cta, incomplete && styles.ctaDisabled]} testID="vehicle-setup-continue"><Text style={[styles.ctaText, incomplete && styles.disabledText]}>{c.next}</Text></Pressable></View>
    <OptionSheet visible={sheet === 'type'} title={c.transport} options={typeOptions} value={draft.vehicle_type} onClose={() => setSheet(null)} onSelect={(value) => setValues({ vehicle_type: value, body_type: '' })} />
    <OptionSheet visible={sheet === 'body'} title={c.body} options={bodyOptions} value={draft.body_type} onClose={() => setSheet(null)} onSelect={(value) => setValue('body_type', value)} />
    <OptionSheet visible={sheet === 'make'} title={c.makeSheet} options={makeOptions} fallbackOption={{ value: 'Other', label: otherMake }} value={draft.make} search hideIcons onClose={() => setSheet(null)} onSelect={selectMake} />
    <OptionSheet visible={sheet === 'model'} title={c.modelSheet} options={modelOptions} fallbackOption={{ value: 'Other', label: otherModel }} value={draft.model} search onClose={() => setSheet(null)} onSelect={selectModel} />
  </SafeAreaView>;
}
