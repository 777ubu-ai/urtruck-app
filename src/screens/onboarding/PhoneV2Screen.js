// PhoneV2Screen — inDrive-style ввод телефона: один экран = одно действие.
//
// "Вход или регистрация" — backend сам поймёт, новый юзер это или
// returning (через флаг is_new в /whatsapp/verify, который мы добавим
// в backend-PR #A). На UI разницы нет.
//
// Поле телефона: слева — CountryPicker (флаг + dial code), справа —
// input для локальной части номера. После CTA "Продолжить" — отправка
// SMS через regAPI.sendCode, навигация на OtpV2 (channel='phone').
//
// Email-канал (для Китая + резерв): вверху сегмент-переключатель
// «Телефон / Email». В режиме Email вместо телефонного поля —
// input почты; CTA вызывает regAPI.sendEmailCode(email, {consent, role})
// и уводит на OtpV2 с channel='email' + email. Телефонный путь не тронут.

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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { regAPI } from '../../utils/registration';
import { brand, radius, space, typography } from '../../theme/brandV2';
import { DEFAULT_COUNTRY } from '../../utils/countries';
import { WEB_URL } from '../../config/env';

const LEGAL_BASE = WEB_URL || 'https://urtruck.kz';
// Открытие юр-документов: window.open на web (новая вкладка) с fallback на
// Linking.openURL — тот же приём, что в ConsentRow (Text onPress на
// react-native-web ненадёжно ловит tap на мелких ссылках).
const openLegal = (path) => {
  const url = `${LEGAL_BASE}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) return;
    } catch {}
  }
  Linking.openURL(url).catch(() => {});
};

const sanitizeDigits = (s) => (s || '').replace(/[^\d]/g, '');

// Та же проверка формата, что и на бэке (_valid_email в registration.py).
const isValidEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((e || '').trim());

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

export default function PhoneV2Screen({ navigation, route }) {
  const { t } = useI18n();
  // 'phone' | 'email' — email сделан каналом входа ПО УМОЛЧАНИЮ: работает
  // глобально (вкл. Китай) и не зависит от доставки SMS, которая надёжна
  // только для номеров КЗ. Телефон остаётся доступен вкладкой (и как контакт).
  const [mode, setMode] = useState('email');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [localDigits, setLocalDigits] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Роль на этом шаге ещё не выбрана (выбор — на RoleV2 после OTP).
  // Пробрасываем role только если пришла из deeplink/params (для аудита).
  const role = route?.params?.role || null;

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

  const onChangeEmail = (text) => {
    setEmail(text);
    if (error) setError(null);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
  };

  const fullPhone = `+${country.dial}${localDigits}`;
  const minDigits = country.dial === '7' ? 10 : 7;
  const isPhoneValid = localDigits.length >= minDigits;
  const isEmailOk = isValidEmail(email);
  const isValid = mode === 'email' ? isEmailOk : isPhoneValid;

  const submit = async () => {
    if (!isValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'email') {
        const cleanEmail = email.trim().toLowerCase();
        const r = await regAPI.sendEmailCode(cleanEmail, { consent: true, role });
        if (r && r.sent === false && r.error && !r.cooldown) {
          setError(t('phone_v2_send_failed'));
          return;
        }
        navigation.navigate('OtpV2', {
          channel: 'email',
          email: cleanEmail,
          mockCode: (r && r.mock) ? r.code : null,
        });
        return;
      }

      const r = await regAPI.sendCode(fullPhone, 'whatsapp', { consent: true, role });
      if (r && (r.ok === false || r.error)) {
        // Backend может вернуть cooldown/error — игнорим cooldown для UX,
        // OTP-экран сам прочитает и покажет.
      }
      // RC2: переход на OtpV2 (light-style) вместо legacy RegOtp.
      // Передаём phone + mockCode (если backend в beta-режиме).
      navigation.navigate('OtpV2', {
        channel: 'phone',
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

          {/* Переключатель канала входа: Email (по умолчанию) / Телефон.
              Email слева и активен по умолчанию — основной канал для всех,
              включая иностранцев без казахстанского номера. */}
          <View style={s.segment} testID="auth-channel-segment">
            <TouchableOpacity
              onPress={() => switchMode('email')}
              activeOpacity={0.8}
              style={[s.segmentBtn, mode === 'email' && s.segmentBtnActive]}
              testID="auth-tab-email"
            >
              <Text style={[s.segmentText, mode === 'email' && s.segmentTextActive]}>
                {t('auth_tab_email')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => switchMode('phone')}
              activeOpacity={0.8}
              style={[s.segmentBtn, mode === 'phone' && s.segmentBtnActive]}
              testID="auth-tab-phone"
            >
              <Text style={[s.segmentText, mode === 'phone' && s.segmentTextActive]}>
                {t('auth_tab_phone')}
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'email' ? (
            <View style={[s.inputRow, error && { borderColor: brand.error }]}>
              <Feather
                name="mail"
                size={20}
                color={brand.textSecondary}
                style={{ marginLeft: 10, marginRight: 4 }}
              />
              <TextInput
                value={email}
                onChangeText={onChangeEmail}
                placeholder={t('email_v2_placeholder')}
                placeholderTextColor={brand.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={s.phoneInput}
                autoFocus
                maxLength={120}
                testID="email-v2-input"
                textContentType="emailAddress"
                autoComplete="email"
                onSubmitEditing={submit}
                returnKeyType="go"
              />
            </View>
          ) : (
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
          )}

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
            <Text style={s.hint}>
              {mode === 'email' ? t('email_v2_send_hint') : t('phone_v2_send_hint')}
            </Text>
          </View>
        </View>

        <Text style={s.consent}>
          {t('onb_v2_consent_prefix')}{' '}
          <Text
            style={s.consentLink}
            onPress={() => openLegal('/terms')}
            accessibilityRole="link"
            suppressHighlighting
          >
            {t('onb_v2_consent_offer')}
          </Text>
          {' '}{t('onb_v2_consent_and')}{' '}
          <Text
            style={s.consentLink}
            onPress={() => openLegal('/privacy')}
            accessibilityRole="link"
            suppressHighlighting
          >
            {t('onb_v2_consent_privacy')}
          </Text>
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
    marginBottom: 20,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: brand.primary,
  },
  segmentText: {
    ...typography.button,
    color: brand.textSecondary,
  },
  segmentTextActive: {
    color: brand.textOnPrimary,
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
    // Chrome/Firefox рисуют собственную рамку и focus-outline поверх
    // TextInput (RN Web не гасит их). Скрин 28.07 показывал жирную чёрную
    // рамку вокруг поля email — это дефолтный <input>-border браузера.
    // На native эти пропы игнорируются (валидные style-ключи для web).
    borderWidth: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
    backgroundColor: 'transparent',
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
