import React, { useEffect, useState } from 'react';
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
  const [basicState, setBasicState] = useState('loading');
  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await regAPI.completeBasic();
      if (!alive) return;
      if (result.ok) {
        setRole('driver');
        setBasicState('done');
      } else {
        setBasicState('error');
      }
    })();
    return () => { alive = false; };
  }, [setRole]);
  const openPublish = () => {
    if (basicState !== 'done') return;
    navigation.replace('CreateTrip', { role: 'driver', vehicle, vehicleId: vehicle?.id });
  };
  const benefits = [['box', c.findLoads], ['map', c.publishRoutes], ['message-circle', c.offers], ['shield', c.safe]];
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <DriverRouteBackdrop />
    <ProgressHeader navigation={navigation} step={4} c={c} />
    <ScrollView contentContainerStyle={[styles.scroll, { alignItems: 'center' }]}>
      <View accessible accessibilityLabel={c.savedAccessibility} style={styles.successCircle}><Feather name="check" size={50} color="#fff" /></View>
      <Text style={[styles.title, { textAlign: 'center' }]}>{c.success}</Text>
      <Text style={[styles.reviewTitle, { textAlign: 'center', marginBottom: 8 }]}>{c.successTitle}</Text>
      <Text style={[styles.subtitle, { textAlign: 'center' }]}>{c.successSub}</Text>
      <Text style={{ color: DRIVER_CERAMIC.active, fontSize: 22, fontWeight: '700', marginVertical: 10 }}>{c.slogan}</Text>
      <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginTop: 14 }}>{benefits.map(([icon, label]) => <View key={label} style={styles.benefit}><Feather name={icon} size={23} color={DRIVER_CERAMIC.active} /><Text style={styles.benefitText}>{label}</Text></View>)}</View>
      <Pressable disabled={basicState !== 'done'} onPress={openPublish} style={[styles.cta, { width: '100%', marginTop: 22 }, basicState !== 'done' && styles.ctaDisabled]}>{basicState === 'loading' ? <ActivityIndicator color={DRIVER_CERAMIC.activeText} /> : <Text style={styles.ctaText}>{c.publish}</Text>}</Pressable>
      {basicState === 'error' ? <Text style={styles.error}>{c.saveError}</Text> : null}
      <Pressable onPress={() => navigation.navigate('Main')} style={{ width: '100%', marginTop: 10 }}><View style={styles.secondary}><Text style={styles.secondaryText}>{c.home}</Text></View></Pressable>
      <Text style={{ marginTop: 20, color: DRIVER_CERAMIC.text, fontSize: 18, fontWeight: '800' }}>Ur<Text style={{ color: DRIVER_CERAMIC.active }}>Truck</Text></Text>
    </ScrollView>
  </SafeAreaView>;
}
