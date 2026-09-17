import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { vehicleAPI } from '../../utils/vehicleAPI';
import { useVehicleCopy, styles } from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
export default function VehicleChooserScreen({ navigation }) {
  const { c } = useVehicleCopy(); const [vehicles, setVehicles] = useState(null);
  useEffect(() => { vehicleAPI.list().then((r) => setVehicles(r.ok ? r.vehicles : [])); }, []);
  if (!vehicles) return <SafeAreaView style={styles.safe}><DriverRouteBackdrop /><ActivityIndicator color={DRIVER_CERAMIC.active} style={{ marginTop: 80 }} /></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><DriverRouteBackdrop /><View style={{ padding: 20 }}><Text style={styles.title}>{c.myVehicles}</Text><FlatList data={vehicles} keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable style={styles.reviewCard} onPress={() => navigation.replace('CreateTrip', { role: 'driver', vehicle: item, vehicleId: item.id })}><View style={styles.reviewHeader}><Feather name="truck" size={23} color={DRIVER_CERAMIC.active} /><Text style={styles.reviewTitle}>{item.make} {item.model}</Text><Feather name="chevron-right" size={22} color={DRIVER_CERAMIC.textMuted} /></View><Text style={styles.subtitle}>{item.body_type} · {item.payload_tons} т · {item.cargo_volume_m3} м³</Text><Text style={styles.reviewValue}>{item.license_plate}</Text></Pressable>} ListEmptyComponent={<Text style={styles.subtitle}>{c.noCountries}</Text>} /><Pressable onPress={() => navigation.navigate('VehicleSetupCountry', { origin: 'CreateTrip' })} style={[styles.cta, { marginTop: 12 }]}><Text style={styles.ctaText}>{c.addVehicle}</Text></Pressable></View></SafeAreaView>;
}
