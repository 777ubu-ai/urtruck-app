// ProfileV2Screen — light-style generic profile (RC2 auth-flow).
//
// Reference: docs/design/rc2-auth-flow/02-profile-light-reference.png
//   Title "Расскажите о себе"
//   "Эти данные будут видны партнёрам в ваших объявлениях"
//   Field "Как вас представить партнёру?" → input "Имя или название компании"
//   Field "Город" → input "Например, Алматы"
//   Green CTA "Продолжить"
//   NO role-pill сверху до выбора роли (per owner-instruction)
//   NO skip / "войти позже" (per owner-instruction)
//
// Generic profile = name + city only. Без role-specific полей
// (truck_type / capacity / company / usual_cargo). Эти детали
// собираются позже при публикации первого груза/рейса.
//
// Бизнес-логика: regAPI.updateProfile({name, city}), затем reset Main
// с роль из session (предполагается что RoleV2 уже её установил
// через AuthContext.setRole перед этим экраном).

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { brand, radius, typography } from '../../theme/brandV2';

export default function ProfileV2Screen({ navigation, route }) {
  const { t } = useI18n();
  const { session } = useAuth();
  const role = session?.user?.role || 'driver';

  // P1 email-phone (08.08.2026): при регистрации по e-mail телефон
  // обязателен для обеих ролей. Идентификатор входа приходит в
  // route.params.phone; для email-канала это e-mail (содержит '@') —
  // тогда показываем обязательное поле телефона.
  const signupId = route?.params?.phone || '';
  const isEmailSignup = /@/.test(signupId);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [cityFocused, setCityFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const phoneDigits = phone.replace(/\D/g, '');

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = t('profile_v2_err_name');
    if (city.trim().length < 2) e.city = t('profile_v2_err_city');
    if (isEmailSignup && phoneDigits.length < 10) e.phone = t('prem_reg_phone_invalid');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onContinue = async () => {
    if (busy) return;
    if (!validate()) return;
    setBusy(true);
    setServerError('');
    try {
      // role шлём всегда → backend применяет контракт (phone обязателен для
      // обеих ролей, name — для shipper). phone добавляем при email-signup.
      const payload = { name: name.trim(), city: city.trim(), role };
      if (isEmailSignup) payload.phone = phone.trim();
      await regAPI.updateProfile(payload);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { role } }],
      });
    } catch (e) {
      // Бэкенд может вернуть PHONE_REQUIRED/NAME_REQUIRED — показываем причину.
      const code = e?.detail?.error || e?.error;
      if (code === 'PHONE_REQUIRED' || code === 'INVALID_PHONE') {
        setErrors((prev) => ({ ...prev, phone: t('prem_reg_phone_invalid') }));
      } else if (code === 'NAME_REQUIRED') {
        setErrors((prev) => ({ ...prev, name: t('profile_v2_err_name') }));
      } else {
        setServerError(t('profile_v2_save_failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const formValid =
    name.trim().length >= 2 &&
    city.trim().length >= 2 &&
    (!isEmailSignup || phoneDigits.length >= 10);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="profile-v2-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
            testID="profile-v2-back"
            accessibilityRole="button"
          >
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.title}>{t('profile_v2_title')}</Text>
          <Text style={s.subtitle}>{t('profile_v2_subtitle')}</Text>

          {/* Name */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (errors.name) setErrors({ ...errors, name: null });
              }}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder={t('profile_v2_name_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[
                s.input,
                nameFocused && s.inputFocused,
                errors.name && s.inputError,
              ]}
              autoCapitalize="words"
              testID="profile-v2-name"
            />
            {errors.name ? <Text style={s.errText}>{errors.name}</Text> : null}
          </View>

          {/* City */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_city_label')}</Text>
            <TextInput
              value={city}
              onChangeText={(v) => {
                setCity(v);
                if (errors.city) setErrors({ ...errors, city: null });
              }}
              onFocus={() => setCityFocused(true)}
              onBlur={() => setCityFocused(false)}
              placeholder={t('profile_v2_city_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[
                s.input,
                cityFocused && s.inputFocused,
                errors.city && s.inputError,
              ]}
              testID="profile-v2-city"
            />
            {errors.city ? <Text style={s.errText}>{errors.city}</Text> : null}
          </View>

          {/* Phone — обязателен при регистрации по e-mail (P1, обе роли) */}
          {isEmailSignup ? (
            <View style={s.field}>
              <Text style={s.label}>{t('prem_reg_phone_label')}</Text>
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (errors.phone) setErrors({ ...errors, phone: null });
                }}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
                placeholder={t('prem_reg_phone_placeholder')}
                placeholderTextColor={brand.textTertiary}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                style={[
                  s.input,
                  phoneFocused && s.inputFocused,
                  errors.phone && s.inputError,
                ]}
                testID="profile-v2-phone"
              />
              {errors.phone ? <Text style={s.errText}>{errors.phone}</Text> : null}
            </View>
          ) : null}

          {serverError ? <Text style={s.serverError}>{serverError}</Text> : null}

          <Pressable
            onPress={onContinue}
            disabled={busy || !formValid}
            accessibilityRole="button"
            testID="profile-v2-cta"
            style={({ pressed }) => [
              s.ctaPrimary,
              { backgroundColor: formValid ? brand.primary : brand.borderStrong },
              pressed && formValid && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={s.ctaPrimaryText}>{t('profile_v2_continue')}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    marginBottom: 24,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    ...typography.bodySmall,
    color: brand.textPrimary,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...typography.bodyLarge,
    color: brand.textPrimary,
  },
  inputFocused: {
    borderColor: brand.primary,
  },
  inputError: {
    borderColor: brand.error,
  },
  errText: {
    ...typography.caption,
    color: brand.error,
    marginTop: 6,
  },
  serverError: {
    ...typography.bodySmall,
    color: brand.error,
    textAlign: 'center',
    marginBottom: 8,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
  },
});
