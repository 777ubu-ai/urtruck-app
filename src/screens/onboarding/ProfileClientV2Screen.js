// ProfileClientV2Screen — расширенный профиль грузовладельца.
//
// Поля (по PLAN_RC2_AUTH_FLOW_V2.md):
//   • Имя или название компании (обязательное)
//   • Город                     (обязательное)
//   • Компания                  (опционально, отдельным полем для юридической формы)
//   • Что обычно отправляете    (опционально, free-text)
//
// Сохранение — regAPI.updateProfile({name, city}). Компания и
// usual_cargo пока локально (storage), backend PATCH расширим в PR #A.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { storage } from '../../utils/storage';
import { brand, radius, typography } from '../../theme/brandV2';

export default function ProfileClientV2Screen({ navigation }) {
  const { t } = useI18n();
  const { setRole } = useAuth();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [company, setCompany] = useState('');
  const [usualCargo, setUsualCargo] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = t('profile_v2_err_name');
    if (city.trim().length < 2) e.city = t('profile_v2_err_city');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onFinish = async () => {
    if (busy) return;
    if (!validate()) return;
    setBusy(true);
    try {
      const trimmedName = name.trim();
      const trimmedCity = city.trim();
      try {
        await regAPI.updateProfile({ name: trimmedName, city: trimmedCity });
      } catch {}
      try {
        await storage.set('ur_client_company', JSON.stringify({
          company: company.trim() || null,
          usual_cargo: usualCargo.trim() || null,
        }));
      } catch {}
      setRole('client');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { role: 'client' } }],
      });
    } finally {
      setBusy(false);
    }
  };

  const onSkip = () => {
    if (busy) return;
    setRole('client');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { role: 'client' } }],
    });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="profile-client-v2-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </TouchableOpacity>
          <View style={s.rolePill}>
            <Feather name="package" size={14} color={brand.primary} />
            <Text style={s.rolePillText}>{t('role_v2_client_card_title')}</Text>
          </View>
          <View style={s.backBtn} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t('profile_v2_client_title')}</Text>
          <Text style={s.subtitle}>{t('profile_v2_client_subtitle')}</Text>

          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_client_name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={(v) => { setName(v); if (errors.name) setErrors({ ...errors, name: null }); }}
              placeholder={t('profile_v2_client_name_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[s.input, errors.name && s.inputError]}
              autoCapitalize="words"
              testID="profile-v2-name"
            />
            {errors.name ? <Text style={s.errText}>{errors.name}</Text> : null}
          </View>

          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_client_company_label')}</Text>
            <TextInput
              value={company}
              onChangeText={setCompany}
              placeholder={t('profile_v2_client_company_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={s.input}
              testID="profile-v2-company"
            />
            <Text style={s.fieldHint}>{t('profile_v2_optional_hint')}</Text>
          </View>

          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_city_label')}</Text>
            <TextInput
              value={city}
              onChangeText={(v) => { setCity(v); if (errors.city) setErrors({ ...errors, city: null }); }}
              placeholder={t('profile_v2_city_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[s.input, errors.city && s.inputError]}
              testID="profile-v2-city"
            />
            {errors.city ? <Text style={s.errText}>{errors.city}</Text> : null}
          </View>

          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_client_cargo_label')}</Text>
            <TextInput
              value={usualCargo}
              onChangeText={setUsualCargo}
              placeholder={t('profile_v2_client_cargo_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[s.input, { minHeight: 64 }]}
              multiline
              testID="profile-v2-cargo"
            />
            <Text style={s.fieldHint}>{t('profile_v2_optional_hint')}</Text>
          </View>
        </ScrollView>

        <View style={s.ctaWrap}>
          <TouchableOpacity
            onPress={onFinish}
            disabled={busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            testID="profile-v2-finish"
            style={[s.ctaPrimary, { backgroundColor: brand.primary }]}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={s.ctaPrimaryText}>{t('profile_v2_finish')}</Text>
                <Feather name="arrow-right" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} disabled={busy} style={s.skipBtn} testID="profile-v2-skip">
            <Text style={s.skipText}>{t('profile_v2_skip')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  rolePillText: {
    ...typography.caption,
    color: brand.primary,
    fontWeight: '800',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    marginBottom: 20,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    ...typography.bodySmall,
    color: brand.textPrimary,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.bodyLarge,
    color: brand.textPrimary,
  },
  inputError: {
    borderColor: brand.error,
  },
  errText: {
    ...typography.caption,
    color: brand.error,
    marginTop: 4,
  },
  fieldHint: {
    ...typography.caption,
    color: brand.textTertiary,
    marginTop: 4,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: brand.divider,
    backgroundColor: brand.bg,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
    flex: 1,
    textAlign: 'center',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  skipText: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
