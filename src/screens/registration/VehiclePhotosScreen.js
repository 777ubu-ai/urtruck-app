// VehiclePhotosScreen — Шаг 4/5 PRO-верификации (фото авто + салона/кабины).
//
// Канонический PRO-flow: Identity → Selfie → VehicleDocs → этот экран →
// TruckParams → submit. Отдельный шаг «фото кузова» (PR-V9): фото авто снаружи
// и салона/кабины — это один логический блок, отделён от документов. Реальный
// server-side upload через /register/vehicle-photo и /register/cabin-photo;
// status 'done' только при backend key (no fake-success). Оба фото required.
// Ключи персистятся server-side самими endpoint'ами; raw в лог не пишем.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import RegistrationCloseModal from '../../components/RegistrationCloseModal';
import RegistrationHelpSheet from '../../components/RegistrationHelpSheet';
import PhotoGuide from '../../components/PhotoGuide';
import QaStepSkip from '../../components/dev/QaStepSkip';
import { brand, radius, typography } from '../../theme/brandV2';

const TOTAL_STEPS = 6;
const STEP = 5;

export default function VehiclePhotosScreen({ navigation, route }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [vehiclePhoto, setVehiclePhoto] = useState({ uri: null, status: 'idle', key: null });
  // Фото салона/кабины убрано (решение владельца): это грузовик, салон клиенту
  // не важен, а водителю лишняя беготня. Оставлено только фото авто снаружи.
  const [errors, setErrors] = useState({});
  const [closeVisible, setCloseVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  // Камера приоритетна (снимок ТС); если доступ к камере не выдан — галерея.
  const pickCameraOrGallery = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status === 'granted') {
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!r.canceled && r.assets?.[0]?.uri) return r.assets[0].uri;
      return null;
    }
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (lib.status !== 'granted') {
      toast(t('photo_permission_required'), 'error');
      return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!r.canceled && r.assets?.[0]?.uri) return r.assets[0].uri;
    return null;
  };

  // Фото авто снаружи — реальный upload; done только при vehicle_photo_key.
  const handleVehiclePhoto = async () => {
    const uri = await pickCameraOrGallery();
    if (!uri) return;
    setVehiclePhoto({ uri, status: 'busy', key: null });
    try {
      const up = await regAPI.uploadVehiclePhoto(uri);
      const key = up?.vehicle_photo_key || null;
      if (!key) throw new Error('no_key');
      setVehiclePhoto({ uri, status: 'done', key });
      if (errors.vehiclePhoto) setErrors({ ...errors, vehiclePhoto: null });
    } catch (e) {
      setVehiclePhoto({ uri, status: 'error', key: null });
      toast(t('vdocs_vehicle_photo_upload_err'), 'error', 5000);
    }
  };

  const vehiclePhotoDone = vehiclePhoto.status === 'done';

  const onNext = () => {
    // Обязательно только фото авто снаружи (салон убран).
    if (!vehiclePhotoDone) {
      setErrors({ vehiclePhoto: t('missing_vehicle_photo') });
      toast(t('missing_vehicle_photo'), 'error');
      return;
    }
    setErrors({});
    navigation.navigate('TruckParams', {
      fromVerification: true,
      plate: route?.params?.plate || null,
    });
  };

  const progress = STEP / TOTAL_STEPS;

  const DocCard = ({ title, titleIcon, hint, doc, onPick, errorText }) => (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {titleIcon ? <Feather name={titleIcon} size={16} color={brand.textPrimary} /> : null}
        <Text style={[s.cardTitle, { marginBottom: 0 }]}>{title}</Text>
      </View>
      {hint ? <Text style={s.cardHint}>{hint}</Text> : null}
      <Pressable onPress={onPick} style={s.slot} disabled={doc.status === 'busy'}>
        {doc.uri ? (
          <Image source={{ uri: doc.uri }} style={s.thumb} resizeMode="cover" />
        ) : (
          <>
            <Feather name="camera" size={22} color={brand.textSecondary} />
            <Text style={s.slotText}>{t('vdocs_add_photo')}</Text>
          </>
        )}
        {doc.status === 'busy' ? (
          <View style={s.busyOverlay}>
            <ActivityIndicator color={brand.primary} />
            <Text style={s.busyText}>{t('vdocs_processing')}</Text>
          </View>
        ) : null}
      </Pressable>
      {doc.status === 'done' ? (
        <View style={s.okBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="check-circle" size={14} color={brand.primary} />
            <Text style={s.okText}>{t('vdocs_uploaded')}</Text>
          </View>
        </View>
      ) : null}
      {doc.status === 'error' ? <Text style={s.errText}>{errorText}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="vehicle-photos-screen">
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn} testID="vp-back">
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </Pressable>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={s.stepLabel}>{`${t('reg_step')} ${STEP} ${t('reg_of')} ${TOTAL_STEPS}`}</Text>
        <Pressable onPress={() => setHelpVisible(true)} style={s.backBtn} testID="vp-help" accessibilityLabel={t('reg_help_open')}>
          <Feather name="help-circle" size={22} color={brand.textSecondary} />
        </Pressable>
        <Pressable onPress={() => setCloseVisible(true)} style={s.backBtn} testID="vp-close">
          <Feather name="x" size={22} color={brand.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{t('vehicle_photos_title')}</Text>
        <Text style={s.subtitle}>{t('vehicle_photos_subtitle')}</Text>

        <PhotoGuide
          source={require('../../assets/onboarding/verification/guides/truck_exterior_guide.png')}
          testID="vp-exterior-guide"
        />
        <DocCard
          title={t('vehicle_photo_exterior')}
          titleIcon="truck"
          hint={t('vphotos_hint_exterior')}
          doc={vehiclePhoto}
          onPick={handleVehiclePhoto}
          errorText={t('vdocs_vehicle_photo_upload_err')}
        />
        {errors.vehiclePhoto ? <Text style={s.errText}>{errors.vehiclePhoto}</Text> : null}

        {/* DEV/QA-only: якорь-прыжок на TruckParams (используется как нижний
            scroll-anchor в Maestro, чтобы образцы вставали над футером). */}
        <QaStepSkip
          onPress={() => navigation.navigate('TruckParams', { fromVerification: true })}
        />
      </ScrollView>

      <View style={s.ctaWrap}>
        <Pressable onPress={onNext} style={s.cta} testID="vp-next">
          <Text style={s.ctaText}>{t('vehicle_photos_next')}</Text>
        </Pressable>
      </View>
      <RegistrationCloseModal
        visible={closeVisible}
        onCancel={() => setCloseVisible(false)}
        onExit={() => { setCloseVisible(false); navigation.navigate('Main'); }}
      />
      <RegistrationHelpSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand.primary },
  stepLabel: { ...typography.bodySmall, color: brand.textSecondary },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { ...typography.h1, color: brand.textPrimary, marginBottom: 4 },
  subtitle: { ...typography.bodySmall, color: brand.textSecondary, marginBottom: 16 },
  card: { marginTop: 16, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  cardTitle: { ...typography.bodyLarge, fontWeight: '800', color: brand.textPrimary, marginBottom: 4 },
  cardHint: { ...typography.caption, color: brand.textSecondary, marginBottom: 10, lineHeight: 16 },
  slot: { height: 160, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  slotText: { ...typography.bodySmall, color: brand.textSecondary },
  thumb: { width: '100%', height: '100%' },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 8 },
  busyText: { ...typography.bodySmall, color: '#fff' },
  okBox: { marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: brand.primarySoft },
  okText: { ...typography.bodySmall, fontWeight: '800', color: brand.primary },
  errText: { ...typography.caption, color: '#EF4444', marginTop: 8 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
