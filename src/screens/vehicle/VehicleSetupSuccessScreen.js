import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useVehicleCopy, ProgressHeader, styles } from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { useI18n } from '../../utils/useI18n';

const completionMessage = (result, c, lang) => {
  const detail = result?.detail;
  if (detail?.error === 'BASIC_ONBOARDING_INCOMPLETE' && Array.isArray(detail.fields)) {
    const fields = {
      citizenship_country: c.citizenship, vehicle_registration_country: c.registration,
      truck_kind: c.transport, body_type: c.body, vehicle_brand: c.make,
      vehicle_plate: c.plate, capacity_tons: c.payload, volume_m3: c.volume,
      full_name: lang === 'ZH' ? '姓名' : lang === 'EN' ? 'Full name' : lang === 'KK' ? 'Аты-жөні' : 'ФИО',
      birth_date: lang === 'ZH' ? '出生日期' : lang === 'EN' ? 'Date of birth' : lang === 'KK' ? 'Туған күні' : 'Дата рождения',
      iin: lang === 'ZH' ? '个人识别号' : lang === 'EN' ? 'Personal ID' : lang === 'KK' ? 'ЖСН' : 'ИИН',
    };
    const labels = detail.fields.map((field) => fields[field]).filter(Boolean);
    if (labels.length) return `${lang === 'ZH' ? '请补充：' : lang === 'EN' ? 'Please complete: ' : lang === 'KK' ? 'Толтырыңыз: ' : 'Заполните: '}${labels.join(', ')}`;
  }
  if (detail?.error === 'ROLE_ALREADY_SET') return lang === 'ZH' ? '此帐户已选择其他角色。请使用司机帐户登录。' : lang === 'EN' ? 'This account already has another role. Sign in with a driver account.' : lang === 'KK' ? 'Бұл аккаунтта басқа рөл таңдалған. Жүргізуші аккаунтпен кіріңіз.' : 'Для этого аккаунта уже выбрана другая роль. Войдите под аккаунтом перевозчика.';
  return c.saveErrorSub;
};

export default function VehicleSetupSuccessScreen({ navigation, route }) {
  const { c } = useVehicleCopy();
  const { lang } = useI18n();
  const { setRole } = useAuth();
  const vehicle = route?.params?.vehicle;
  const origin = route?.params?.origin;
  const returnsToExistingFlow = origin === 'Border' || origin === 'Profile';
  const [basicState, setBasicState] = useState(returnsToExistingFlow ? 'done' : 'loading');
  const [completionError, setCompletionError] = useState('');
  const completionStarted = useRef(false);
  const completeBasic = useCallback(async () => {
    setBasicState('loading');
    setCompletionError('');
    try {
      const result = await regAPI.completeBasic();
      if (result?.ok) {
        setRole('driver');
        setBasicState('done');
      } else {
        setCompletionError(completionMessage(result, c, lang));
        setBasicState('error');
      }
    } catch {
      setCompletionError(c.saveErrorSub);
      setBasicState('error');
    }
  }, [c, lang, setRole]);
  useEffect(() => {
    if (returnsToExistingFlow) return undefined;
    if (completionStarted.current) return undefined;
    completionStarted.current = true;
    completeBasic();
    return undefined;
  }, [completeBasic, returnsToExistingFlow]);
  const openPublish = () => {
    if (basicState !== 'done') return;
    if (origin === 'Border') {
      navigation.replace('Main', { role: 'driver', screen: 'Queue' });
      return;
    }
    if (origin === 'Profile') {
      navigation.replace('Profile', { role: 'driver' });
      return;
    }
    navigation.replace('CreateTrip', { role: 'driver', vehicle, vehicleId: vehicle?.id });
  };
  const benefits = [['box', c.findLoads], ['map', c.publishRoutes], ['message-circle', c.offers], ['shield', c.safe]];
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <DriverRouteBackdrop />
    <ProgressHeader navigation={navigation} step={4} c={c} />
    <ScrollView contentContainerStyle={[styles.scroll, { alignItems: 'center' }]}>
      {basicState === 'done' ? <>
        <View accessible accessibilityLabel={c.savedAccessibility} style={styles.successCircle}><Feather name="check" size={50} color="#fff" /></View>
        <Text style={[styles.title, { textAlign: 'center' }]}>{c.success}</Text>
        <Text style={[styles.reviewTitle, { textAlign: 'center', marginBottom: 8 }]}>{c.successTitle}</Text>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>{c.successSub}</Text>
        <Text style={{ color: DRIVER_CERAMIC.active, fontSize: 22, fontWeight: '700', marginVertical: 10 }}>{c.slogan}</Text>
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginTop: 14 }}>{benefits.map(([icon, label]) => <View key={label} style={styles.benefit}><Feather name={icon} size={23} color={DRIVER_CERAMIC.active} /><Text style={styles.benefitText}>{label}</Text></View>)}</View>
        <Pressable onPress={openPublish} style={[styles.cta, { width: '100%', marginTop: 22 }]} testID={origin === 'Border' ? 'border-vehicle-return' : origin === 'Profile' ? 'profile-vehicle-return' : 'basic-onboarding-publish'}><Text style={styles.ctaText}>{origin === 'Border' ? c.backToBorder : origin === 'Profile' ? c.backToProfile : c.publish}</Text></Pressable>
        <Pressable onPress={() => navigation.replace('Main', { role: 'driver' })} style={[{ width: '100%', marginTop: 10 }]} testID="basic-onboarding-home"><View style={styles.secondary}><Text style={styles.secondaryText}>{c.home}</Text></View></Pressable>
      </> : <View style={{ width: '100%', alignItems: 'center', paddingTop: 52 }} testID={`basic-onboarding-${basicState}`}>
        {basicState === 'loading' ? <ActivityIndicator size="large" color={DRIVER_CERAMIC.active} /> : <View style={styles.errorCircle}><Feather name="alert-circle" size={40} color={DRIVER_CERAMIC.error} /></View>}
        <Text style={[styles.title, { textAlign: 'center', marginTop: 20 }]}>{basicState === 'loading' ? c.loading : (c.finishErrorTitle || c.saveError)}</Text>
        {basicState === 'error' ? <>
          <Text selectable style={[styles.subtitle, { textAlign: 'center', marginBottom: 18 }]}>{completionError || c.saveErrorSub}</Text>
          <View style={styles.errorActions}>
            <Pressable testID="basic-onboarding-fix-data" onPress={() => navigation.navigate('VehicleSetupCountry', route?.params)} style={[styles.secondary, styles.errorAction]}><Text style={styles.secondaryText}>{c.edit}</Text></Pressable>
            <Pressable testID="basic-onboarding-retry" onPress={completeBasic} style={[styles.cta, styles.errorAction]}><Text style={styles.ctaText}>{c.retry}</Text></Pressable>
          </View>
        </> : null}
      </View>}
      <Text style={{ marginTop: 28, color: DRIVER_CERAMIC.text, fontSize: 18, fontWeight: '800' }}>Ur<Text style={{ color: DRIVER_CERAMIC.active }}>Truck</Text></Text>
    </ScrollView>
  </SafeAreaView>;
}
