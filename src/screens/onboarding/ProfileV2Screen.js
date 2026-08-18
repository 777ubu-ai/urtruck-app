// ProfileV2Screen — active RC2 profile step.
// Shipper identity is intentionally explicit: a driver must know who the
// customer is before accepting real cargo. Name + country + phone are required;
// company and city remain optional for a shipper.
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
import { brand, useBrand, radius, typography } from '../../theme/brandV2';

const COPY = {
  RU: {
    countryLabel: 'Страна *', countryPlaceholder: 'Например, Китай', countryError: 'Укажите страну',
    companyLabel: 'Компания', companyPlaceholder: 'Название компании (необязательно)',
    phoneRequiredLabel: 'Телефон *', shipperHint: 'Имя, страна и телефон будут видны партнёру по сделке.',
  },
  EN: {
    countryLabel: 'Country *', countryPlaceholder: 'For example, China', countryError: 'Enter your country',
    companyLabel: 'Company', companyPlaceholder: 'Company name (optional)',
    phoneRequiredLabel: 'Phone *', shipperHint: 'Your name, country and phone identify you to the deal partner.',
  },
  ZH: {
    countryLabel: '国家 *', countryPlaceholder: '例如：中国', countryError: '请输入国家',
    companyLabel: '公司', companyPlaceholder: '公司名称（选填）',
    phoneRequiredLabel: '手机号 *', shipperHint: '姓名、国家和手机号会向交易伙伴显示。',
  },
  KK: {
    countryLabel: 'Ел *', countryPlaceholder: 'Мысалы, Қытай', countryError: 'Елді көрсетіңіз',
    companyLabel: 'Компания', companyPlaceholder: 'Компания атауы (міндетті емес)',
    phoneRequiredLabel: 'Телефон *', shipperHint: 'Атыңыз, еліңіз және телефоныңыз мәміле серіктесіне көрінеді.',
  },
};

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

export default function ProfileV2Screen({ navigation, route }) {
  const _b = useBrand();
  const s = React.useMemo(() => makeStyles(_b), [_b]);
  const { t, lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  const { session } = useAuth();
  const role = route?.params?.role || session?.user?.role || 'driver';
  const isShipper = role === 'client';

  const signupId = route?.params?.phone || session?.user?.phone || '';
  const isEmailSignup = /@/.test(signupId);
  const initialPhone = isEmailSignup ? '' : signupId;

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [focused, setFocused] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const validName = name.trim().length >= 2;
  const validCity = city.trim().length >= 2;
  const validCountry = country.trim().length >= 2;
  const validPhone = digitsOnly(phone).length >= 10;

  const validate = () => {
    const next = {};
    if (!validName) next.name = t('profile_v2_err_name');
    if (!isShipper && !validCity) next.city = t('profile_v2_err_city');
    if (isShipper && !validCountry) next.country = ui.countryError;
    if ((isShipper || isEmailSignup) && !validPhone) next.phone = t('prem_reg_phone_invalid');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onContinue = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    setServerError('');
    try {
      const payload = {
        name: name.trim(),
        city: city.trim(),
        role,
      };
      if (isShipper) {
        payload.country = country.trim();
        payload.company_name = company.trim();
      }
      if (validPhone) payload.phone = phone.trim();

      const saved = await regAPI.updateProfile(payload);
      if (!saved?.ok) {
        const detail = saved?.detail;
        const code = detail?.error || saved?.error;
        if (code === 'PHONE_REQUIRED' || code === 'INVALID_PHONE') {
          setErrors((prev) => ({ ...prev, phone: t('prem_reg_phone_invalid') }));
          return;
        }
        if (code === 'NAME_REQUIRED') {
          setErrors((prev) => ({ ...prev, name: t('profile_v2_err_name') }));
          return;
        }
        if (code === 'COUNTRY_REQUIRED') {
          setErrors((prev) => ({ ...prev, country: ui.countryError }));
          return;
        }
        throw new Error(typeof detail === 'string' ? detail : 'profile_save_failed');
      }
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch {
      setServerError(t('profile_v2_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const formValid = isShipper
    ? validName && validCountry && validPhone
    : validName && validCity && (!isEmailSignup || validPhone);

  const Field = ({ id, label, value, onChange, placeholder, keyboardType, inputMode, autoCapitalize = 'sentences', requiredError }) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => {
          onChange(next);
          if (errors[id]) setErrors((prev) => ({ ...prev, [id]: null }));
        }}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused('')}
        placeholder={placeholder}
        placeholderTextColor={brand.textTertiary}
        keyboardType={keyboardType}
        inputMode={inputMode}
        textContentType={id === 'phone' ? 'telephoneNumber' : undefined}
        autoCapitalize={autoCapitalize}
        style={[s.input, focused === id && s.inputFocused, errors[id] && s.inputError]}
        testID={`profile-v2-${id}`}
      />
      {errors[id] ? <Text style={s.errText}>{errors[id] || requiredError}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="profile-v2-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]} testID="profile-v2-back" accessibilityRole="button">
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t('profile_v2_title')}</Text>
          <Text style={s.subtitle}>{isShipper ? ui.shipperHint : t('profile_v2_subtitle')}</Text>

          <Field id="name" label={`${t('profile_v2_name_label')} *`} value={name} onChange={setName} placeholder={t('profile_v2_name_placeholder')} autoCapitalize="words" />

          {isShipper ? (
            <>
              <Field id="country" label={ui.countryLabel} value={country} onChange={setCountry} placeholder={ui.countryPlaceholder} autoCapitalize="words" />
              <Field id="phone" label={ui.phoneRequiredLabel} value={phone} onChange={setPhone} placeholder={t('prem_reg_phone_placeholder')} keyboardType="phone-pad" inputMode="tel" autoCapitalize="none" />
              <Field id="company" label={ui.companyLabel} value={company} onChange={setCompany} placeholder={ui.companyPlaceholder} autoCapitalize="words" />
              <Field id="city" label={t('profile_v2_city_label')} value={city} onChange={setCity} placeholder={t('profile_v2_city_placeholder')} autoCapitalize="words" />
            </>
          ) : (
            <>
              <Field id="city" label={`${t('profile_v2_city_label')} *`} value={city} onChange={setCity} placeholder={t('profile_v2_city_placeholder')} autoCapitalize="words" />
              {isEmailSignup ? <Field id="phone" label={ui.phoneRequiredLabel} value={phone} onChange={setPhone} placeholder={t('prem_reg_phone_placeholder')} keyboardType="phone-pad" inputMode="tel" autoCapitalize="none" /> : null}
            </>
          )}

          {serverError ? <Text style={s.serverError}>{serverError}</Text> : null}

          <Pressable
            onPress={onContinue}
            disabled={busy || !formValid}
            accessibilityRole="button"
            testID="profile-v2-cta"
            style={({ pressed }) => [s.ctaPrimary, { backgroundColor: formValid ? brand.primary : brand.borderStrong }, pressed && formValid && { opacity: 0.85 }]}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.ctaPrimaryText}>{t('profile_v2_continue')}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  title: { ...typography.h1, color: brand.textPrimary, marginBottom: 8 },
  subtitle: { ...typography.body, color: brand.textSecondary, marginBottom: 24 },
  field: { marginBottom: 18 },
  label: { ...typography.bodySmall, color: brand.textPrimary, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, paddingVertical: 14, ...typography.bodyLarge, color: brand.textPrimary },
  inputFocused: { borderColor: brand.primary },
  inputError: { borderColor: brand.error },
  errText: { ...typography.caption, color: brand.error, marginTop: 6 },
  serverError: { ...typography.bodySmall, color: brand.error, textAlign: 'center', marginBottom: 8 },
  ctaPrimary: { height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaPrimaryText: { ...typography.button, color: brand.textOnPrimary },
});