// SelfieStepScreen — Шаг 2/4 PRO-верификации водителя (селфи + liveness).
//
// Отправляет ИИН+ФИО (из IdentityStep) и фронтальное селфи в
// POST /register/selfie (regAPI.uploadSelfie): сервер валидирует ИИН +
// госреестр, проверяет liveness и face-match. Success показываем ТОЛЬКО при
// res.face_verified === true (без fake-success). Фото не сохраняем в репо,
// ИИН/ответ backend в лог не пишем.

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
import { translit, hasCyrillic } from '../../utils/translit';
import { brand, radius, typography } from '../../theme/brandV2';

const TOTAL_STEPS = 5;
const STEP = 2;

export default function SelfieStepScreen({ navigation, route }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const iin = route?.params?.iin;
  const fullName = route?.params?.fullName;

  // status: idle | busy | done | error
  const [selfie, setSelfie] = useState({ uri: null, status: 'idle' });
  const [confidence, setConfidence] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [closeVisible, setCloseVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  // Фронтальная камера для селфи; галерея — fallback (web / нет камеры).
  const pickSelfie = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status === 'granted') {
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        cameraType: ImagePicker.CameraType.front,
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

  const takeSelfie = async () => {
    if (!iin || !fullName) {
      toast(t('reg_check_name_iin'), 'error');
      return;
    }
    const uri = await pickSelfie();
    if (!uri) return;
    setSelfie({ uri, status: 'busy' });
    try {
      // backend ждёт латиницу для full_name.
      const latinName = hasCyrillic(fullName) ? translit(fullName) : fullName;
      const res = await regAPI.uploadSelfie(iin, latinName, uri);
      if (res && res.face_verified) {
        setConfidence(res.liveness_confidence || 0);
        setSelfie({ uri, status: 'done' });
        toast(t('reg_selfie_confirmed'), 'success');
      } else {
        setSelfie({ uri, status: 'error' });
        setAttempts((a) => a + 1);
        const detail = typeof res?.detail === 'string' ? res.detail : t('reg_selfie_bad_photo');
        toast(detail, 'error', 5000);
      }
    } catch (e) {
      setSelfie({ uri, status: 'error' });
      setAttempts((a) => a + 1);
      toast(t('reg_selfie_bad_photo'), 'error');
    }
  };

  const verified = selfie.status === 'done';
  const goForward = () => {
    // Безопасный форвард: только ключ личного фото из #73 (он уже сохранён
    // server-side). Raw selfie-uri/base64 дальше НЕ передаём — само селфи уже
    // ушло на /register/selfie.
    navigation.navigate('VehicleDocs', {
      personalPhotoKey: route?.params?.personalPhotoKey || null,
    });
  };
  const onNext = () => {
    if (!verified) return;
    goForward();
  };
  // 7.5: liveness может падать из-за засветки/солнца, запирая водителя. После
  // 2 неудачных попыток даём пройти дальше с пометкой на ручную проверку —
  // фото уже загружено на сервер, модератор проверит (совпадает с авто-
  // одобрением + флагом manual_review). Не «fake-success»: доступ к рейсам
  // всё равно решается на серверной модерации.
  const canManualReview = !verified && attempts >= 2;

  const progress = STEP / TOTAL_STEPS;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="selfie-step-screen">
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn} testID="selfie-back">
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </Pressable>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={s.stepLabel}>{t('selfie_step')}</Text>
        <Pressable onPress={() => setHelpVisible(true)} style={s.backBtn} testID="selfie-help" accessibilityLabel={t('reg_help_open')}>
          <Feather name="help-circle" size={22} color={brand.textSecondary} />
        </Pressable>
        <Pressable onPress={() => setCloseVisible(true)} style={s.backBtn} testID="selfie-close">
          <Feather name="x" size={22} color={brand.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{t('selfie_title')}</Text>
        <Text style={s.subtitle}>{t('selfie_subtitle')}</Text>

        <PhotoGuide
          source={require('../../assets/onboarding/verification/guides/personal_photo_guide.png')}
          testID="selfie-guide"
        />
        <Pressable onPress={takeSelfie} style={s.slot} disabled={selfie.status === 'busy'} testID="selfie-slot">
          {selfie.uri ? (
            <Image source={{ uri: selfie.uri }} style={s.thumb} resizeMode="cover" />
          ) : (
            <>
              <Feather name="camera" size={26} color={brand.textSecondary} />
              <Text style={s.slotText}>{t('selfie_take')}</Text>
            </>
          )}
          {selfie.status === 'busy' ? (
            <View style={s.busyOverlay}>
              <ActivityIndicator color={brand.primary} />
              <Text style={s.busyText}>{t('vdocs_processing')}</Text>
            </View>
          ) : null}
        </Pressable>

        {verified ? (
          <View style={s.okBox}>
            <Text style={s.okText}>
              ✅ {t('reg_selfie_confirmed')} ({Math.round((confidence || 0) * 100)}%)
            </Text>
          </View>
        ) : null}
        {selfie.status === 'error' ? (
          <Text style={s.err}>{t('reg_selfie_bad_photo')}</Text>
        ) : null}

        {/* Явный retry: пересняться можно в любой момент (done/error). */}
        {selfie.uri && selfie.status !== 'busy' ? (
          <Pressable onPress={takeSelfie} style={s.retakeBtn} testID="selfie-retake">
            <Feather name="refresh-ccw" size={16} color={brand.primary} />
            <Text style={s.retakeText}>{t('reg_selfie_retake')}</Text>
          </Pressable>
        ) : null}

        {/* 7.5: после 2 неудач liveness (засветка/солнце) не запираем —
            даём отправить на ручную проверку. Фото уже на сервере. */}
        {canManualReview ? (
          <Pressable onPress={goForward} style={s.manualBtn} testID="selfie-manual-review">
            <Feather name="user-check" size={16} color={brand.textSecondary} />
            <Text style={s.manualText}>{t('reg_selfie_manual_review')}</Text>
          </Pressable>
        ) : null}

        {/* DEV/QA-only: прыжок на VehicleDocs в обход face_verified-гейта. */}
        <QaStepSkip
          onPress={() => navigation.navigate('VehicleDocs', {
            personalPhotoKey: route?.params?.personalPhotoKey || 'qa-skip',
          })}
        />
      </ScrollView>

      <View style={s.ctaWrap}>
        <Pressable
          onPress={onNext}
          disabled={!verified}
          style={[s.cta, !verified && { opacity: 0.5 }]}
          testID="selfie-next"
        >
          <Text style={s.ctaText}>{t('selfie_next')}</Text>
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
  slot: { height: 240, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  slotText: { ...typography.bodySmall, color: brand.textSecondary },
  thumb: { width: '100%', height: '100%' },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 8 },
  busyText: { ...typography.bodySmall, color: '#fff' },
  okBox: { marginTop: 14, padding: 12, borderRadius: radius.md, backgroundColor: brand.primarySoft },
  okText: { ...typography.bodySmall, fontWeight: '800', color: brand.primary },
  retakeBtn: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  retakeText: { ...typography.bodySmall, fontWeight: '700', color: brand.primary },
  manualBtn: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, minHeight: 44 },
  manualText: { ...typography.bodySmall, fontWeight: '700', color: brand.textSecondary, textDecorationLine: 'underline' },
  err: { ...typography.caption, color: brand.error, marginTop: 12 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
