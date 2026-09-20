import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useVehicleCopy, ProgressHeader, styles } from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';

export default function VehicleSetupSuccessScreen({ navigation, route }) {
  const { c } = useVehicleCopy();
  const { setRole } = useAuth();
  const vehicle = route?.params?.vehicle;
  const origin = route?.params?.origin;
  const returnsToExistingFlow = origin === 'Border' || origin === 'Profile';
  const [basicState, setBasicState] = useState(returnsToExistingFlow ? 'done' : 'loading');
  const completionStarted = useRef(false);
  const completeBasic = useCallback(async () => {
    setBasicState('loading');
    try {
      const result = await regAPI.completeBasic();
      if (result?.ok) {
        setRole('driver');
        setBasicState('done');
      } else {
        setBasicState('error');
      }
    } catch {
      setBasicState('error');
    }
  }, [setRole]);
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
      </> : <View style={{ width: '100%', alignItems: 'center', paddingTop: 56 }} testID={`basic-onboarding-${basicState}`}>
        {basicState === 'loading' ? <ActivityIndicator size="large" color={DRIVER_CERAMIC.active} /> : <Feather name="alert-circle" size={48} color={DRIVER_CERAMIC.error} />}
        <Text style={[styles.reviewTitle, { textAlign: 'center', marginTop: 18 }]}>{basicState === 'loading' ? c.loading : c.saveErrorSub}</Text>
        {basicState === 'error' ? <Pressable testID="basic-onboarding-retry" onPress={completeBasic} style={styles.secondary}><Text style={styles.secondaryText}>{c.retry}</Text></Pressable> : null}
      </View>}
      <Text style={{ marginTop: 20, color: DRIVER_CERAMIC.text, fontSize: 18, fontWeight: '800' }}>Ur<Text style={{ color: DRIVER_CERAMIC.active }}>Truck</Text></Text>
    </ScrollView>
  </SafeAreaView>;
}
