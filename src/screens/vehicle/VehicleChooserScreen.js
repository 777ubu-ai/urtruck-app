import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { vehicleAPI } from '../../utils/vehicleAPI';
import { storage } from '../../utils/storage';
import { useVehicleCopy, styles } from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import BackButton from '../../components/ui/v1/BackButton';
const DRAFT_KEY = 'ur_vehicle_setup_draft';

export default function VehicleChooserScreen({ navigation, route }) {
  const { c } = useVehicleCopy();
  const [vehicles, setVehicles] = useState(null);
  const origin = route?.params?.origin || 'CreateTrip';

  useEffect(() => { vehicleAPI.list().then((r) => setVehicles(r.ok ? r.vehicles : [])); }, []);

  const openVehicle = async (item) => {
    if (origin === 'CreateTrip') {
      navigation.replace('CreateTrip', { role: 'driver', vehicle: item, vehicleId: item.id });
      return;
    }
    await storage.set(DRAFT_KEY, JSON.stringify(item));
    navigation.navigate('VehicleSetupCountry', { role: 'driver', origin, vehicleId: item.id });
  };

  const addVehicle = async () => {
    await storage.remove(DRAFT_KEY);
    navigation.navigate('VehicleSetupCountry', { role: 'driver', origin });
  };

  const header = <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, alignItems: 'flex-start' }}><BackButton onPress={() => navigation.goBack()} label={c.back} testID="vehicle-chooser-back" /></View>;
  if (!vehicles) return <SafeAreaView style={styles.safe}><DriverRouteBackdrop />{header}<ActivityIndicator color={DRIVER_CERAMIC.active} style={{ marginTop: 56 }} /></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><DriverRouteBackdrop />{header}<View style={{ paddingHorizontal: 20, paddingBottom: 20, flex: 1 }}>
    <Text style={styles.title}>{c.myVehicles}</Text>
    <FlatList
      data={vehicles}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <Pressable style={styles.reviewCard} onPress={() => openVehicle(item)} testID="vehicle-chooser-item"><View style={styles.reviewHeader}><Feather name="truck" size={23} color={DRIVER_CERAMIC.active} /><Text style={styles.reviewTitle}>{item.make} {item.model}</Text><Feather name={origin === 'CreateTrip' ? 'chevron-right' : 'edit-2'} size={20} color={DRIVER_CERAMIC.textMuted} /></View><Text style={styles.subtitle}>{item.body_type} · {item.payload_tons} т · {item.cargo_volume_m3} м³</Text><Text style={styles.reviewValue}>{item.license_plate}</Text></Pressable>}
      ListEmptyComponent={<Text style={styles.subtitle}>{c.noVehicles}</Text>}
    />
    <Pressable onPress={addVehicle} style={[styles.cta, { marginTop: 12 }]} testID="vehicle-chooser-add"><Text style={styles.ctaText}>{c.addVehicle}</Text></Pressable>
  </View></SafeAreaView>;
}
