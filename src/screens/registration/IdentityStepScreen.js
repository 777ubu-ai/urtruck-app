// IdentityStepScreen — Шаг 1/4 PRO-верификации водителя (Personal Info).
//
// Канонический PRO-flow: Security/Profile → Identity → Selfie → VehicleDocs →
// TruckParams → submit. Этот экран собирает личные данные: фото, имя, фамилию,
// дату рождения, ИИН — и валидирует их на клиенте ДО перехода. Имя+фамилия
// объединяются в full_name (backend-whitelist). birth_date/full_name пишутся в
// draft (PATCH /driver/registration/draft). ИИН отправляется на следующем шаге
// в /register/selfie (там серверная валидация + госреестр). ИИН/ФИО/дату в лог
// не пишем; личное фото в репо не сохраняем.

import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import RegistrationCloseModal from '../../components/RegistrationCloseModal';
import { brand, radius, typography } from '../../theme/brandV2';

const TOTAL_STEPS = 5;
const STEP = 1;

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

  const validateName = (v) => (!v || v.trim().length < 2 ? t('val_name_short') : null);

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

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      toast(t('photo_permission_required'), 'error');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!r.canceled && r.assets?.[0]?.uri) {
      setPhotoUri(r.assets[0].uri);
      if (errors.photo) setErrors({ ...errors, photo: null });
    }
  };

  const onNext = async () => {
    const e = {
      photo: photoUri ? null : t('identity_err_photo'),
      firstName: validateName(firstName),
      lastName: validateName(lastName),
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
    // 1) Реальный server-side upload личного фото. Без успешного upload дальше
    //    НЕ идём (никакого fake-success) — показываем понятный toast.
    let photoKey = null;
    try {
      const up = await regAPI.uploadPersonalPhoto(photoUri);
      photoKey = up?.personal_photo_key || null;
      if (!photoKey) throw new Error('no_key');
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

    navigation.navigate('Selfie', {
      iin: iin.trim(),
      fullName,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birth_date: birthDate.trim(),
      photoUri,
      personalPhotoKey: photoKey,
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
          <Text style={s.stepLabel}>{t('identity_step')}</Text>
          <Pressable onPress={() => setCloseVisible(true)} style={s.backBtn} testID="identity-close">
            <Feather name="x" size={22} color={brand.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t('identity_title')}</Text>
          <Text style={s.subtitle}>{t('identity_subtitle')}</Text>

          {/* Личная фотография (обязательно) */}
          <Text style={s.label}>{t('identity_photo_label')}</Text>
          <Pressable onPress={pickPhoto} style={s.photoSlot} testID="identity-photo">
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={s.photoThumb} resizeMode="cover" />
            ) : (
              <>
                <Feather name="camera" size={24} color={brand.textSecondary} />
                <Text style={s.photoText}>{t('identity_photo_add')}</Text>
              </>
            )}
          </Pressable>
          {errors.photo ? <Text style={s.err}>{errors.photo}</Text> : null}

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

          {/* Дата рождения */}
          <Text style={s.label}>{t('identity_birth_label')}</Text>
          <TextInput
            value={birthDate}
            onChangeText={(v) => { setBirthDate(maskBirth(v)); if (errors.birth) setErrors({ ...errors, birth: null }); }}
            keyboardType="numeric"
            placeholder={t('identity_birth_ph')}
            placeholderTextColor={brand.textTertiary}
            maxLength={10}
            style={[s.input, errors.birth && s.inputErr]}
            testID="identity-birth"
          />
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
  photoSlot: { height: 160, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  photoThumb: { width: '100%', height: '100%' },
  photoText: { ...typography.bodySmall, color: brand.textSecondary },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, color: brand.textPrimary, ...typography.body },
  inputErr: { borderColor: brand.error },
  err: { ...typography.caption, color: brand.error, marginTop: 6 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
