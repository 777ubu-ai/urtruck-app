import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { vehicleAPI } from '../../utils/vehicleAPI';
import { storage } from '../../utils/storage';
import { useVehicleCopy, styles } from '../../components/vehicle/VehicleSetupUI';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import DriverRouteBackdrop from '../../components/ui/v1/DriverRouteBackdrop';
import BackButton from '../../components/ui/v1/BackButton';
import AppConfirmModal from '../../components/ui/AppConfirmModal';
const DRAFT_KEY = 'ur_vehicle_setup_draft';

export default function VehicleChooserScreen({ navigation, route }) {
  const { c } = useVehicleCopy();
  const [vehicles, setVehicles] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const origin = route?.params?.origin || 'CreateTrip';
  const bodyLabel = (vehicle) => c.bodies?.[vehicle.body_type] || vehicle.body_type;

  const loadVehicles = async () => {
    const result = await vehicleAPI.list();
    if (!result?.ok) setError(result?.detail || c.saveError);
    setVehicles(result?.ok ? result.vehicles : []);
  };

  useEffect(() => { loadVehicles(); }, []);

  const deleteVehicle = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setError('');
    const result = await vehicleAPI.remove(pendingDelete.id);
    if (result?.ok) {
      setPendingDelete(null);
      await loadVehicles();
    } else {
      setError(result?.error === 'VEHICLE_IN_USE' ? c.vehicleInUse : (result?.detail || c.deleteVehicleError));
      setPendingDelete(null);
    }
    setDeleting(false);
  };

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
      renderItem={({ item }) => <Pressable style={styles.reviewCard} onPress={() => openVehicle(item)} testID="vehicle-chooser-item">
        <View style={styles.reviewHeader}>
          <Feather name="truck" size={23} color={DRIVER_CERAMIC.active} />
          <Text style={[styles.reviewTitle, localStyles.vehicleTitle]}>{item.make} {item.model}</Text>
          <Feather name={origin === 'CreateTrip' ? 'chevron-right' : 'edit-2'} size={20} color={DRIVER_CERAMIC.textMuted} />
          {origin !== 'CreateTrip' ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={c.deleteVehicle}
            testID={`vehicle-delete-${item.id}`}
            style={localStyles.deleteButton}
            onPress={(event) => {
              event?.stopPropagation?.();
              setPendingDelete(item);
            }}
          >
            <Feather name="trash-2" size={19} color={DRIVER_CERAMIC.error} />
          </Pressable> : null}
        </View>
        <Text style={styles.subtitle}>{bodyLabel(item)} · {item.payload_tons} т · {item.cargo_volume_m3} м³</Text>
        <Text style={styles.reviewValue}>{item.license_plate}</Text>
      </Pressable>}
      ListEmptyComponent={<Text style={styles.subtitle}>{c.noVehicles}</Text>}
    />
    {error ? <Text selectable style={[styles.error, localStyles.error]}>{error}</Text> : null}
    <Pressable onPress={addVehicle} style={[styles.cta, localStyles.addButton]} testID="vehicle-chooser-add"><Text style={styles.ctaText}>{c.addVehicle}</Text></Pressable>
    <AppConfirmModal
      visible={!!pendingDelete}
      title={c.deleteVehicle}
      message={c.deleteVehicleConfirm}
      cancelLabel={c.cancel}
      confirmLabel={deleting ? c.loading : c.deleteVehicle}
      destructive
      onCancel={() => !deleting && setPendingDelete(null)}
      onConfirm={deleteVehicle}
      testID="vehicle-delete-confirm"
    />
  </View></SafeAreaView>;
}

const localStyles = StyleSheet.create({
  vehicleTitle: { flex: 1 },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { marginVertical: 8 },
  addButton: { marginTop: 12 },
});
