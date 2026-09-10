import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useVehicleCopy, ProgressHeader, styles } from '../../components/vehicle/VehicleSetupUI';

export default function VehicleSetupSuccessScreen({ navigation, route }) {
  const { c } = useVehicleCopy();
  const vehicle = route?.params?.vehicle;
  const openPublish = () => navigation.replace('CreateTrip', { role: 'driver', vehicle, vehicleId: vehicle?.id });
  const benefits = [['box', c.findLoads], ['map', c.publishRoutes], ['message-circle', c.offers], ['shield', c.safe]];
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ProgressHeader navigation={navigation} step={4} c={c} />
    <ScrollView contentContainerStyle={[styles.scroll, { alignItems: 'center' }]}>
      <View accessible accessibilityLabel={c.savedAccessibility} style={styles.successCircle}><Feather name="check" size={50} color="#fff" /></View>
      <Text style={[styles.title, { textAlign: 'center' }]}>{c.success}</Text>
      <Text style={[styles.reviewTitle, { textAlign: 'center', marginBottom: 8 }]}>{c.successTitle}</Text>
      <Text style={[styles.subtitle, { textAlign: 'center' }]}>{c.successSub}</Text>
      <Text style={{ color: '#168759', fontSize: 22, fontWeight: '700', marginVertical: 10 }}>{c.slogan}</Text>
      <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginTop: 14 }}>{benefits.map(([icon, label]) => <View key={label} style={styles.benefit}><Feather name={icon} size={23} color="#168759" /><Text style={styles.benefitText}>{label}</Text></View>)}</View>
      <Pressable onPress={openPublish} style={[styles.cta, { width: '100%', marginTop: 22 }]}><Text style={styles.ctaText}>{c.publish}</Text></Pressable>
      <Pressable onPress={() => navigation.navigate('Main')} style={{ width: '100%', marginTop: 10 }}><View style={styles.secondary}><Text style={styles.secondaryText}>{c.home}</Text></View></Pressable>
      <Text style={{ marginTop: 20, color: '#14221C', fontSize: 18, fontWeight: '800' }}>Ur<Text style={{ color: '#168759' }}>Truck</Text></Text>
    </ScrollView>
  </SafeAreaView>;
}
