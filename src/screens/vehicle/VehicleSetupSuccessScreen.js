import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import { styles, useVehicleCopy } from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { useI18n } from '../../utils/useI18n';

const completionMessage = (result, c, lang) => {
  const detail = result?.detail;
  if (detail?.error === 'BASIC_ONBOARDING_INCOMPLETE' && Array.isArray(detail.fields)) {
    const fields = {
      citizenship_country: c.citizenship,
      vehicle_registration_country: c.registration,
      truck_kind: c.transport,
      body_type: c.body,
      vehicle_brand: c.make,
      vehicle_plate: c.plate,
      capacity_tons: c.payload,
      volume_m3: c.volume,
      full_name: lang === 'ZH' ? '姓名' : lang === 'EN' ? 'Full name' : lang === 'KK' ? 'Аты-жөні' : 'ФИО',
      birth_date: lang === 'ZH' ? '出生日期' : lang === 'EN' ? 'Date of birth' : lang === 'KK' ? 'Туған күні' : 'Дата рождения',
    };
    const labels = detail.fields.map((field) => fields[field]).filter(Boolean);
    if (labels.length) {
      const prefix = lang === 'ZH' ? '请补充：' : lang === 'EN' ? 'Please complete: ' : lang === 'KK' ? 'Толтырыңыз: ' : 'Заполните: ';
      return `${prefix}${labels.join(', ')}`;
    }
  }
  if (detail?.error === 'ROLE_ALREADY_SET') {
    return lang === 'ZH'
      ? '此帐户已选择其他角色。请使用司机帐户登录。'
      : lang === 'EN'
        ? 'This account already has another role. Sign in with a driver account.'
        : lang === 'KK'
          ? 'Бұл аккаунтта басқа рөл таңдалған. Жүргізуші аккаунтпен кіріңіз.'
          : 'Для этого аккаунта уже выбрана другая роль. Войдите под аккаунтом перевозчика.';
  }
  return c.saveErrorSub;
};

export default function VehicleSetupSuccessScreen({ navigation, route }) {
  const { c } = useVehicleCopy();
  const { lang } = useI18n();
  const { setRole } = useAuth();
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
    if (returnsToExistingFlow || completionStarted.current) return undefined;
    completionStarted.current = true;
    completeBasic();
    return undefined;
  }, [completeBasic, returnsToExistingFlow]);

  const finish = () => {
    if (basicState !== 'done') return;
    if (origin === 'Border') {
      navigation.replace('Main', { role: 'driver', screen: 'Queue' });
      return;
    }
    if (origin === 'Profile') {
      navigation.replace('Profile', { role: 'driver' });
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { role: 'driver', screen: 'Feed' } }],
    });
  };

  const buttonLabel = origin === 'Border'
    ? c.backToBorder
    : origin === 'Profile'
      ? c.backToProfile
      : (c.goToLoads || c.home);

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="vehicle-setup-success">
    <DriverRouteBackdrop />
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
      {basicState === 'done' ? <>
        <View accessible accessibilityLabel={c.savedAccessibility} style={styles.successCircle}>
          <Feather name="check" size={46} color="#fff" />
        </View>
        <Text style={[styles.title, { textAlign: 'center', marginTop: 24 }]}>
          {c.registrationComplete || c.success}
        </Text>
        <Pressable onPress={finish} style={[styles.cta, { width: '100%', marginTop: 28 }]} testID={origin === 'Border' ? 'border-vehicle-return' : origin === 'Profile' ? 'profile-vehicle-return' : 'basic-onboarding-loads'}>
          <Text style={styles.ctaText}>{buttonLabel}</Text>
        </Pressable>
      </> : <>
        {basicState === 'loading'
          ? <ActivityIndicator size="large" color={DRIVER_CERAMIC.active} />
          : <View style={styles.errorCircle}><Feather name="alert-circle" size={40} color={DRIVER_CERAMIC.error} /></View>}
        <Text style={[styles.title, { textAlign: 'center', marginTop: 20 }]}>
          {basicState === 'loading' ? c.loading : (c.finishErrorTitle || c.saveError)}
        </Text>
        {basicState === 'error' ? <>
          <Text selectable style={[styles.subtitle, { textAlign: 'center', marginBottom: 18 }]}>
            {completionError || c.saveErrorSub}
          </Text>
          <View style={styles.errorActions}>
            <Pressable testID="basic-onboarding-fix-data" onPress={() => navigation.replace('VehicleSetupCountry', { ...route?.params, preserveDraft: true })} style={[styles.secondary, styles.errorAction]}>
              <Text style={styles.secondaryText}>{c.edit}</Text>
            </Pressable>
            <Pressable testID="basic-onboarding-retry" onPress={completeBasic} style={[styles.cta, styles.errorAction]}>
              <Text style={styles.ctaText}>{c.retry}</Text>
            </Pressable>
          </View>
        </> : null}
      </>}
    </View>
  </SafeAreaView>;
}
