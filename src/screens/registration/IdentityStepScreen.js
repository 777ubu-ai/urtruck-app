// IdentityStepScreen — Шаг 1/4 PRO-верификации водителя (Personal Info).
//
// Канонический PRO-flow: Security/Profile → Identity → Selfie → VehicleDocs →
// TruckParams → submit. Этот экран собирает личные данные: фото, имя, фамилию,
// дату рождения, ИИН — и валидирует их на клиенте ДО перехода. Имя+фамилия
// объединяются в full_name (backend-whitelist). birth_date/full_name пишутся в
// draft (PATCH /driver/registration/draft). ИИН отправляется на следующем шаге
// в /register/selfie (там серверная валидация + госреестр). ИИН/ФИО/дату в лог
// не пишем; личное фото в репо не сохраняем.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
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
import DateOfBirthSheet from '../../components/DateOfBirthSheet';
import { brand, radius, typography } from '../../theme/brandV2';

const TOTAL_STEPS = 4;
const STEP = 2;

// Маска ДД.ММ.ГГГГ: только цифры (до 8), точки расставляются сами.
const maskBirth = (v) => {
  const d = String(v).replace(/\D/g, '').slice(0, 8);
  const parts = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length > 2) parts.push(d.slice(2, 4));
  if (d.length > 4) parts.push(d.slice(4, 8));
  return parts.join('.');
};

export default function IdentityStepScreen({ navigation }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [photoUri, setPhotoUri] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [iin, setIin] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [closeVisible, setCloseVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [dobSheetVisible, setDobSheetVisible] = useState(false);
  // Ключ уже загруженного личного фото (с сервера) — чтобы при повторном входе
  // не заставлять переснимать.
  const [serverPhotoKey, setServerPhotoKey] = useState(null);
  // Удостоверение личности — лицевая/оборотная (новый порядок, шаг 2).
  const [idFront, setIdFront] = useState(null);       // локальный uri
  const [idBack, setIdBack] = useState(null);
  const [hasIdFront, setHasIdFront] = useState(false); // уже на сервере
  const [hasIdBack, setHasIdBack] = useState(false);

  // Повторный вход: подтягиваем уже сохранённые данные, а не пустую форму.
  // Для новичка status() вернёт null/пусто → поля остаются пустыми (без регресса).
  useEffect(() => {
    let alive = true;
    (async () => {
      const st = await regAPI.status().catch(() => null);
      if (!alive || !st) return;
      if (st.full_name && !firstName && !lastName) {
        const parts = String(st.full_name).trim().split(/\s+/);
        setLastName(parts[0] || '');           // full_name хранится как «Фамилия Имя»
        setFirstName(parts.slice(1).join(' '));
      }
      if (st.birth_date && !birthDate) {
        const s = String(st.birth_date).trim();
        // Нормализуем ISO (YYYY-MM-DD) → DD.MM.YYYY, которое ждёт валидатор.
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        setBirthDate(iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : s);
      }
      if (st.iin && !iin) setIin(String(st.iin).replace(/\D/g, '').slice(0, 12));
      if (st.has_personal_photo && st.personal_photo_key) {
        setServerPhotoKey(st.personal_photo_key);
      }
      if (st.has_id_front) setHasIdFront(true);
      if (st.has_id_back) setHasIdBack(true);
    })();
    return () => { alive = false; };
  }, []);

  // ТЗ блок 10: при закрытии — сохранить несохранённые поля экрана в draft.
  // Бросаем при !ok, чтобы модал не вышел молча. Фото уже persist server-side.
  const saveDraftOnClose = async () => {
    const fullName = `${lastName.trim()} ${firstName.trim()}`.trim();
    const payload = {};
    if (fullName) payload.full_name = fullName;
    if (birthDate.trim()) payload.birth_date = birthDate.trim();
    if (!Object.keys(payload).length) return;
    const res = await regAPI.saveDriverDraft(payload);
    if (!res.ok) throw new Error('save_failed');
  };

  const validateName = (v, msgKey = 'val_name_short') => (!v || v.trim().length < 2 ? t(msgKey) : null);

  const validateIin = (v) => {
    if (!v) return t('val_required');
    if (!/^\d+$/.test(v)) return t('val_iin_digits');
    if (v.length !== 12) return t('val_iin_12');
    return null;
  };

  // Дата рождения: формат ДД.ММ.ГГГГ + реальная календарная дата + возраст 18..100.
  const validateBirth = (v) => {
    if (!v) return t('val_required');
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v.trim());
    if (!m) return t('identity_err_birth');
    const day = +m[1];
    const mon = +m[2];
    const year = +m[3];
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return t('identity_err_birth');
    const d = new Date(year, mon - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== mon - 1 || d.getDate() !== day) {
      return t('identity_err_birth');
    }
    const now = new Date();
    let age = now.getFullYear() - year;
    const hadBirthday = now.getMonth() > mon - 1 || (now.getMonth() === mon - 1 && now.getDate() >= day);
    if (!hadBirthday) age -= 1;
    if (age < 18 || age > 100) return t('identity_err_birth');
    return null;
  };

  // issue #1: личное фото — это фото лица для верификации, поэтому
  // ОСНОВНОЕ действие открывает камеру сразу (а не галерею со случайными
  // скриншотами). Галерея — вторичная опция по явному выбору. Чистый
  // preview показываем только после успешного локального выбора.
  const applyPicked = (r) => {
    if (!r.canceled && r.assets?.[0]?.uri) {
      setPhotoUri(r.assets[0].uri);
      if (errors.photo) setErrors({ ...errors, photo: null });
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      toast(t('camera_permission_required'), 'error', 5000);
      return;
    }
    try {
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        cameraType: ImagePicker.CameraType.front,
        quality: 0.9,
      });
      applyPicked(r);
    } catch {
      toast(t('camera_error'), 'error', 4000);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      toast(t('photo_permission_required'), 'error', 5000);
      return;
    }
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      applyPicked(r);
    } catch {
      toast(t('camera_error'), 'error', 4000);
    }
  };

  // Выбор фото стороны удостоверения (камера/галерея).
  const pickIdSide = (setter, errKey) => {
    const apply = (r) => {
      if (!r.canceled && r.assets?.[0]?.uri) {
        setter(r.assets[0].uri);
        if (errors[errKey]) setErrors((prev) => ({ ...prev, [errKey]: null }));
      }
    };
    const cam = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { toast(t('camera_permission_required'), 'error', 5000); return; }
      try { apply(await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })); }
      catch { toast(t('camera_error'), 'error', 4000); }
    };
    const gal = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') { toast(t('photo_permission_required'), 'error', 5000); return; }
      try { apply(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })); }
      catch { toast(t('camera_error'), 'error', 4000); }
    };
    if (Platform.OS === 'web') { gal(); return; }
    Alert.alert(t('id_step_title'), '', [
      { text: '📷 ' + t('camera'), onPress: cam },
      { text: '🖼 ' + t('gallery'), onPress: gal },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const onNext = async () => {
    const e = {
      // Фото ок, если только что выбрали новое ИЛИ уже загружено ранее (повторный вход).
      photo: (photoUri || serverPhotoKey) ? null : t('identity_err_photo'),
      idFront: (idFront || hasIdFront) ? null : t('id_err_front'),
      idBack: (idBack || hasIdBack) ? null : t('id_err_back'),
      firstName: validateName(firstName),
      lastName: validateName(lastName, 'val_surname_short'),
      birth: validateBirth(birthDate),
      iin: validateIin(iin),
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      toast(e.photo ? e.photo : t('reg_check_name_iin'), 'error');
      return;
    }
    // Фамилия Имя — порядок как в документах.
    const fullName = `${lastName.trim()} ${firstName.trim()}`.trim();

    setSaving(true);
    // 1) Личное фото. Если пользователь НЕ переснимал (повторный вход) — используем
    //    уже загруженный на сервере ключ, без повторной выгрузки. Иначе — реальный
    //    server-side upload (никакого fake-success).
    let photoKey = serverPhotoKey;
    try {
      if (photoUri) {
        const up = await regAPI.uploadPersonalPhoto(photoUri);
        photoKey = up?.personal_photo_key || null;
      }
      if (!photoKey) throw new Error('no_key');
    } catch (err) {
      setSaving(false);
      // issue #1: более конкретная ошибка где возможно (нет интернета /
      // файл слишком большой / иначе общий upload-fail).
      const msg = String(err?.message || err || '');
      let key = 'identity_err_photo_upload';
      if (/network|fetch|timeout|соединени|connection|интернет/i.test(msg)) key = 'upload_err_network';
      else if (/413|too large|payload|size|больш/i.test(msg)) key = 'upload_err_too_large';
      toast(t(key), 'error', 5000);
      return;
    }

    // 1b) Удостоверение личности (2 стороны). Грузим только новые фото; если
    //     сторона уже на сервере (повторный вход) — не перезагружаем.
    try {
      if (idFront) await regAPI.uploadIdFront(idFront);
      if (idBack) await regAPI.uploadIdBack(idBack);
    } catch (err) {
      setSaving(false);
      toast(t('identity_err_photo_upload'), 'error', 5000);
      return;
    }

    // 2) В draft пишем только whitelisted: full_name, birth_date и безопасный
    //    ключ фото (personal_photo_url). Fail-tolerant: фото уже сохранено
    //    server-side endpoint'ом, потеря авто-сейва прочих полей не критична.
    try {
      await regAPI.saveDriverDraft({
        full_name: fullName,
        birth_date: birthDate.trim(),
        personal_photo_url: photoKey,
      });
    } catch (err) {
      // ignore
    }
    setSaving(false);

    // Упрощённый флоу (решение владельца): селфи и фото фуры убраны, чтобы не
    // перегружать водителя. После удостоверения — сразу документы на авто.
    navigation.navigate('VehicleDocs', {
      iin: iin.trim(),
      fullName,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birth_date: birthDate.trim(),
      fromVerification: true,
    });
  };

  const progress = STEP / TOTAL_STEPS;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="identity-step-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} testID="identity-back">
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </Pressable>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.stepLabel}>{`${t('reg_step')} ${STEP} ${t('reg_of')} ${TOTAL_STEPS}`}</Text>
          <Pressable onPress={() => setHelpVisible(true)} style={s.backBtn} testID="identity-help" accessibilityLabel={t('reg_help_open')}>
            <Feather name="help-circle" size={22} color={brand.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setCloseVisible(true)} style={s.backBtn} testID="identity-close">
            <Feather name="x" size={22} color={brand.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t('identity_title')}</Text>
          <Text style={s.subtitle}>{t('identity_subtitle')}</Text>

          {/* Личная фотография (обязательно) */}
          <Text style={s.label}>{t('identity_photo_label')}</Text>
          <Text style={s.photoHint}>{t('identity_photo_hint')}</Text>
          {/* Образец «как сфотографироваться» (✅/❌) — раньше показывался только
              в verification-флоу; теперь и в рабочей регистрации. Тап = крупно. */}
          <PhotoGuide
            source={require('../../assets/onboarding/verification/guides/personal_photo_guide.png')}
            testID="identity-photo-guide"
          />
          <Pressable onPress={takePhoto} style={s.photoSlot} testID="identity-photo">
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={s.photoThumb} resizeMode="cover" />
            ) : serverPhotoKey ? (
              <>
                <Feather name="check-circle" size={24} color="#22C55E" />
                <Text style={[s.photoText, { color: '#22C55E' }]}>{t('chat_attach_status_uploaded')}</Text>
              </>
            ) : (
              <>
                <Feather name="camera" size={24} color={brand.textSecondary} />
                <Text style={s.photoText}>{t('identity_photo_take')}</Text>
              </>
            )}
          </Pressable>
          {/* Вторичное действие — галерея, только по явному выбору (issue #1) */}
          <Pressable onPress={pickFromGallery} style={s.photoGalleryLink} testID="identity-photo-gallery" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="image" size={14} color={brand.textTertiary} />
            <Text style={s.photoGalleryText}>{photoUri ? t('identity_photo_retake_gallery') : t('identity_photo_gallery')}</Text>
          </Pressable>
          {errors.photo ? <Text style={s.err}>{errors.photo}</Text> : null}

          {/* Удостоверение личности — 2 стороны (новый порядок верификации, шаг 2) */}
          <Text style={s.label}>{t('id_step_title')}</Text>
          <Text style={s.photoHint}>{t('id_photo_hint')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => pickIdSide(setIdFront, 'idFront')} style={[s.photoSlot, { flex: 1, width: undefined }]} testID="identity-id-front">
              {idFront ? (
                <Image source={{ uri: idFront }} style={s.photoThumb} resizeMode="cover" />
              ) : hasIdFront ? (
                <><Feather name="check-circle" size={22} color="#22C55E" /><Text style={[s.photoText, { color: '#22C55E' }]}>{t('id_front_label')}</Text></>
              ) : (
                <><Feather name="credit-card" size={22} color={brand.textSecondary} /><Text style={s.photoText}>{t('id_front_label')}</Text></>
              )}
            </Pressable>
            <Pressable onPress={() => pickIdSide(setIdBack, 'idBack')} style={[s.photoSlot, { flex: 1, width: undefined }]} testID="identity-id-back">
              {idBack ? (
                <Image source={{ uri: idBack }} style={s.photoThumb} resizeMode="cover" />
              ) : hasIdBack ? (
                <><Feather name="check-circle" size={22} color="#22C55E" /><Text style={[s.photoText, { color: '#22C55E' }]}>{t('id_back_label')}</Text></>
              ) : (
                <><Feather name="credit-card" size={22} color={brand.textSecondary} /><Text style={s.photoText}>{t('id_back_label')}</Text></>
              )}
            </Pressable>
          </View>
          {(errors.idFront || errors.idBack) ? <Text style={s.err}>{errors.idFront || errors.idBack}</Text> : null}

          {/* Имя */}
          <Text style={s.label}>{t('identity_first_name_label')}</Text>
          <TextInput
            value={firstName}
            onChangeText={(v) => { setFirstName(v); if (errors.firstName) setErrors({ ...errors, firstName: null }); }}
            placeholder={t('identity_first_name_ph')}
            placeholderTextColor={brand.textTertiary}
            autoCapitalize="words"
            style={[s.input, errors.firstName && s.inputErr]}
            testID="identity-first-name"
          />
          {errors.firstName ? <Text style={s.err}>{errors.firstName}</Text> : null}

          {/* Фамилия */}
          <Text style={s.label}>{t('identity_last_name_label')}</Text>
          <TextInput
            value={lastName}
            onChangeText={(v) => { setLastName(v); if (errors.lastName) setErrors({ ...errors, lastName: null }); }}
            placeholder={t('identity_last_name_ph')}
            placeholderTextColor={brand.textTertiary}
            autoCapitalize="words"
            style={[s.input, errors.lastName && s.inputErr]}
            testID="identity-last-name"
          />
          {errors.lastName ? <Text style={s.err}>{errors.lastName}</Text> : null}

          {/* Дата рождения — bottom-sheet picker (День/Месяц/Год), не голый ввод */}
          <Text style={s.label}>{t('identity_birth_label')}</Text>
          <Pressable
            onPress={() => setDobSheetVisible(true)}
            style={[s.input, s.dobField, errors.birth && s.inputErr]}
            testID="identity-birth"
          >
            <Text style={birthDate ? s.dobValue : s.dobPlaceholder}>
              {birthDate || t('identity_birth_ph')}
            </Text>
            <Feather name="calendar" size={18} color={brand.textSecondary} />
          </Pressable>
          {errors.birth ? <Text style={s.err}>{errors.birth}</Text> : null}

          {/* ИИН */}
          <Text style={s.label}>{t('identity_iin_label')}</Text>
          <TextInput
            value={iin}
            onChangeText={(v) => {
              const digits = v.replace(/[^\d]/g, '').slice(0, 12);
              setIin(digits);
              if (errors.iin) setErrors({ ...errors, iin: null });
            }}
            keyboardType="numeric"
            placeholder={t('identity_iin_ph')}
            placeholderTextColor={brand.textTertiary}
            maxLength={12}
            style={[s.input, errors.iin && s.inputErr]}
            testID="identity-iin"
          />
          {errors.iin ? <Text style={s.err}>{errors.iin}</Text> : null}

          {/* DEV/QA-only: прыжок на следующий шаг в обход нативного пикера. */}
          <QaStepSkip
            onPress={() => navigation.navigate('VehicleDocs', {
              iin: '000000000000',
              fullName: 'QA Tester',
              firstName: 'QA',
              lastName: 'Tester',
              birth_date: '01.01.1990',
              fromVerification: true,
            })}
          />
        </ScrollView>

        <View style={s.ctaWrap}>
          <Pressable onPress={onNext} disabled={saving} style={[s.cta, saving && { opacity: 0.6 }]} testID="identity-next">
            {saving ? (
              <ActivityIndicator color={brand.textOnPrimary} />
            ) : (
              <Text style={s.ctaText}>{t('identity_next')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <RegistrationCloseModal
        visible={closeVisible}
        onCancel={() => setCloseVisible(false)}
        onExit={() => { setCloseVisible(false); navigation.navigate('Main'); }}
        saveDraft={saveDraftOnClose}
      />
      <RegistrationHelpSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />
      <DateOfBirthSheet
        visible={dobSheetVisible}
        initial={birthDate}
        onCancel={() => setDobSheetVisible(false)}
        onConfirm={(v) => { setBirthDate(v); setDobSheetVisible(false); if (errors.birth) setErrors({ ...errors, birth: null }); }}
      />
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
  label: { ...typography.bodySmall, fontWeight: '700', color: brand.textPrimary, marginTop: 18, marginBottom: 8 },
  photoHint: { ...typography.caption, color: brand.textSecondary, marginBottom: 8, lineHeight: 16 },
  photoSlot: { alignSelf: 'flex-start', width: 120, height: 120, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  photoThumb: { width: '100%', height: '100%' },
  photoText: { ...typography.caption, color: brand.textSecondary },
  photoGalleryLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 4 },
  photoGalleryText: { ...typography.caption, color: brand.textTertiary, textDecorationLine: 'underline' },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, color: brand.textPrimary, ...typography.body },
  inputErr: { borderColor: brand.error },
  dobField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dobValue: { ...typography.body, color: brand.textPrimary },
  dobPlaceholder: { ...typography.body, color: brand.textTertiary },
  err: { ...typography.caption, color: brand.error, marginTop: 6 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
