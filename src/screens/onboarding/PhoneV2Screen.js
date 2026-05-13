// PhoneV2Screen — inDrive-style ввод телефона: один экран = одно действие.
//
// "Вход или регистрация" — backend сам поймёт, новый юзер это или
// returning (через флаг is_new в /whatsapp/verify, который мы добавим
// в backend-PR #A). На UI разницы нет.
//
// Поле телефона: слева — CountryPicker (флаг + dial code), справа —
// input для локальной части номера. После CTA "Продолжить" — отправка
// SMS через regAPI.sendCode, навигация на существующий PremiumOtpScreen
// (мост на текущий OTP flow до момента, пока не сделаем OtpV2 в batch 2).

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { regAPI } from '../../utils/registration';
import { brand, radius, space, typography } from '../../theme/brandV2';
import { DEFAULT_COUNTRY } from '../../utils/countries';

const sanitizeDigits = (s) => (s || '').replace(/[^\d]/g, '');

const formatLocalPhone = (digits) => {
  // Простой template для KZ/RU (+7): "7 (XXX) XXX-XX-XX" уже учитывает
  // первую "7" из dial. Здесь форматируем только локальную часть.
  // Для других стран — просто группировка по 3.
  const d = digits;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
};

export default function PhoneV2Screen({ navigation }) {
  const { t } = useI18n();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [localDigits, setLocalDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const openCountryPicker = () => {
    navigation.navigate('CountryPicker', {
      onSelect: (c) => {
        setCountry(c);
        setError(null);
      },
    });
  };

  const onChangeLocal = (text) => {
    const d = sanitizeDigits(text).slice(0, 11);
    setLocalDigits(d);
    if (error) setError(null);
  };

  const fullPhone = `+${country.dial}${localDigits}`;
  const minDigits = country.dial === '7' ? 10 : 7;
  const isValid = localDigits.length >= minDigits;

  const submit = async () => {
    if (!isValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await regAPI.sendCode(fullPhone, 'whatsapp', { consent: true });
      if (r && (r.ok === false || r.error)) {
        // Backend может вернуть cooldown/error — игнорим cooldown для UX,
        // OTP-экран сам прочитает и покажет.
      }
      // RC2 batch 2: после Phone — OtpV2 (новый экран). Role не передаём.
      // backend cooldown/error отдаёт сам OtpV2 через regAPI.verifyCode.
      navigation.navigate('OtpV2', {
        phone: fullPhone,
        mockCode: (r && (r.mock || r.beta)) ? r.code : null,
      });
    } catch (e) {
      setError(t('phone_v2_send_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.content}>
          <Text style={s.logo}>
            <Text style={{ color: brand.logoDark }}>Ur</Text>
            <Text style={{ color: brand.logoAccent }}>Truck</Text>
          </Text>

          <Text style={s.title}>{t('phone_v2_title')}</Text>
          <Text style={s.subtitle}>{t('phone_v2_subtitle')}</Text>

          <View style={[s.inputRow, error && { borderColor: brand.error }]}>
            <TouchableOpacity
              onPress={openCountryPicker}
              style={s.countryBtn}
              activeOpacity={0.7}
              testID="phone-v2-country-btn"
            >
              <Text style={s.flag}>{country.flag}</Text>
              <Text style={s.dialCode}>+{country.dial}</Text>
              <Feather name="chevron-down" size={16} color={brand.textSecondary} />
            </TouchableOpacity>
            <View style={s.divider} />
            <TextInput
              value={formatLocalPhone(localDigits)}
              onChangeText={onChangeLocal}
              placeholder={country.dial === '7' ? '7 (___) ___-__-__' : '___-___-____'}
              placeholderTextColor={brand.textTertiary}
              keyboardType="phone-pad"
              style={s.phoneInput}
              autoFocus
              maxLength={20}
              testID="phone-v2-input"
              textContentType="telephoneNumber"
              autoComplete="tel"
            />
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity
            onPress={submit}
            disabled={!isValid || busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            testID="phone-v2-cta"
            style={[
              s.ctaPrimary,
              {
                backgroundColor: isValid ? brand.primary : brand.borderStrong,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={s.ctaPrimaryText}>{t('phone_v2_cta')}</Text>
                <Feather name="arrow-right" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>

          <View style={s.hintRow}>
            <Feather name="shield" size={16} color={brand.textSecondary} />
            <Text style={s.hint}>{t('phone_v2_send_hint')}</Text>
          </View>
        </View>

        <Text style={s.consent}>
          {t('onb_v2_consent_prefix')}{' '}
          <Text style={s.consentLink}>{t('onb_v2_consent_offer')}</Text>
          {' '}{t('onb_v2_consent_and')}{' '}
          <Text style={s.consentLink}>{t('onb_v2_consent_privacy')}</Text>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 36,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    height: 60,
    paddingHorizontal: 6,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  flag: {
    fontSize: 24,
  },
  dialCode: {
    ...typography.bodyLarge,
    color: brand.textPrimary,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: brand.border,
    marginHorizontal: 8,
  },
  phoneInput: {
    flex: 1,
    ...typography.bodyLarge,
    color: brand.textPrimary,
    paddingVertical: 0,
  },
  error: {
    color: brand.error,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginLeft: 4,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 24,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
    flex: 1,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 24,
  },
  hint: {
    flex: 1,
    ...typography.bodySmall,
    color: brand.textSecondary,
    textAlign: 'center',
  },
  consent: {
    fontSize: 12,
    color: brand.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  consentLink: {
    color: brand.textPrimary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
