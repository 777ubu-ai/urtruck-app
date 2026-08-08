// PremiumLoginScreen — Stage 37.
//
// Тёмный premium-экран входа в существующий аккаунт. Заменяет старый
// AuthScreen со светлым дизайном и Telegram/SMS-кнопками в основном
// flow. Старый AuthScreen сохранён только в qaPreview как 'LegacyAuth'.
//
// Поведение:
//  - phone-only вход через Mobizon SMS.
//  - Без пароля, без Apple/Google, без Telegram — только phone+OTP.
//  - Consent НЕ требуется на login (он был принят при регистрации).
//  - Если пользователь нажимает «Зарегистрироваться» — уходим на Role,
//    где он выберет driver/client и пройдёт PremiumRegister.
//
// После клика «Получить код» отправляем SMS и навигируем на
// PremiumOtpScreen с params { mode: 'login', phone }. PremiumOtp в
// login-режиме после verify вызывает regAPI.me() и решает: если у
// юзера в backend уже есть role — идём в Main; если нет — на Role.

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import { formatCooldown } from '../../utils/formatCooldown';
import { formatPhoneForDisplay, toAsciiDigits } from '../../utils/phone';

const ACCENT = { main: '#168A5B', deep: '#0F6B47', soft: '#E8F6EF' };

export default function PremiumLoginScreen({ navigation }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const accent = ACCENT;

  const [phone, setPhone] = useState('+7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Stage 39: cooldown handling — см. PremiumRegisterScreen.
  const [cooldownSec, setCooldownSec] = useState(0);
  const inputRef = useRef(null);

  // Stage 46: общий helper c NFKC-нормализацией.
  const digits = toAsciiDigits(phone);
  const validPhone = digits.length === 11 && digits[0] === '7';

  // Stage 40: тикаем cooldown каждую секунду.
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = setInterval(() => setCooldownSec((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSec]);

  const onChangePhone = (v) => {
    setError('');
    setPhone(formatPhoneForDisplay(v));
  };

  const onSubmit = async () => {
    if (loading) return;
    const normalized = '+' + digits;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[PremiumLogin] canSend', {
        normalizedPhone: normalized,
        validPhone,
        loading,
        disabledReason: loading ? 'loading' : !validPhone ? 'phone-invalid' : 'ok',
      });
    }
    if (!validPhone) {
      setError(t('prem_reg_phone_invalid'));
      try { toast(t('prem_reg_phone_invalid'), 'warn'); } catch {}
      inputRef.current?.focus?.();
      return;
    }
    setLoading(true);
    setError('');
    try {
      // На login consent уже был принят при регистрации, но backend
      // /register/whatsapp/send всё равно валидирует поле — передаём
      // true и role=null. Backend для существующего phone отдаст
      // тот же channel и не создаст дубликат.
      const r = await regAPI.sendCode(normalized, 'sms', { consent: true, role: null });
      if (r.sent || r.ok) {
        setCooldownSec(0);
        navigation.navigate('RegOtp', {
          mode: 'login',
          phone: normalized,
          mockCode: r.mock || r.beta ? r.code : null,
        });
      } else if (r.cooldown) {
        setCooldownSec(r.cooldown_sec || 60);
        setError('');
      } else {
        setError(t('prem_reg_send_failed_friendly'));
        try { toast(t('prem_reg_send_failed_friendly'), 'error'); } catch {}
      }
    } catch (e) {
      setError(t('prem_reg_send_failed_friendly'));
      try { toast(t('prem_reg_send_failed_friendly'), 'error'); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const goEnterCode = () => {
    const normalized = '+' + digits;
    if (digits.length === 11 && digits[0] === '7') {
      navigation.navigate('RegOtp', { mode: 'login', phone: normalized });
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="prem-login-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.flex}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              testID="prem-login-back"
              style={s.backBtn}
            >
              <Text style={s.backIcon}>←</Text>
            </Pressable>
            <View style={[s.tag, { borderColor: accent.main, backgroundColor: accent.soft }]}>
              <Text style={[s.tagText, { color: accent.main }]}>{t('login_action')}</Text>
            </View>
          </View>

          <View style={s.brandRow}>
            <Text style={s.brand}>UrTruck</Text>
          </View>

          <Text style={s.title}>{t('prem_login_title')}</Text>
          <Text style={s.subtitle}>{t('prem_login_subtitle')}</Text>

          <View style={s.fieldBlock}>
            <Text style={s.label}>{t('prem_login_phone_label')}</Text>
            <TextInput
              ref={inputRef}
              value={phone}
              onChangeText={onChangePhone}
              style={[
                s.input,
                { borderColor: error ? '#D64545' : (validPhone ? accent.main : '#E5ECE8') },
              ]}
              placeholder={t('prem_reg_phone_placeholder')}
              placeholderTextColor="#9AA8A0"
              keyboardType="phone-pad"
              // Stage 46 P0 fix — см. PremiumRegisterScreen для контекста.
              // inputMode="tel" даёт numeric keypad на web независимо от
              // текущей системной раскладки (RU/EN/KK/CN).
              inputMode="tel"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
              maxLength={18}
              testID="prem-login-phone-input"
            />
            {error ? <Text style={s.err}>{error}</Text> : null}
          </View>

          {cooldownSec > 0 ? (
            <View style={s.cooldownBox} testID="prem-login-cooldown">
              <Text style={s.cooldownTitle}>{t('prem_reg_cooldown_title')}</Text>
              <Text style={s.cooldownBody}>
                {(t('prem_reg_cooldown_body') || '').replace('{time}', formatCooldown(cooldownSec))}
              </Text>
              <Pressable
                onPress={goEnterCode}
                testID="prem-login-cooldown-enter-code"
                style={({ pressed }) => [s.cooldownBtn, { borderColor: accent.main }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[s.cooldownBtnText, { color: accent.main }]}>
                  {t('prem_reg_cooldown_enter_code')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            testID="prem-login-send-code"
            accessibilityRole="button"
            accessibilityState={{ disabled: !!loading }}
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: accent.main },
              pressed && { opacity: 0.85 },
              loading && { opacity: 0.6 },
              !validPhone && !loading && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <View style={s.ctaLoadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={[s.ctaText, { marginLeft: 10 }]}>{t('prem_reg_sending')}</Text>
              </View>
            ) : (
              <Text style={s.ctaText}>{t('prem_login_send_code')}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Role')}
            testID="prem-login-no-account"
            style={s.linkRow}
          >
            <Text style={s.linkMuted}>
              {t('prem_login_no_account')}{' '}
              <Text style={[s.linkText, { color: accent.main }]}>{t('prem_login_register_link')}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F8F7' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 24,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,34,28,0.04)',
    borderWidth: 1, borderColor: 'rgba(20,34,28,0.10)',
  },
  backIcon: { color: '#14221C', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  tag: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  tagText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },

  brandRow: { marginBottom: 24 },
  brand: { color: '#14221C', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },

  title: { color: '#14221C', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: '#617067', fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: 28 },

  fieldBlock: { marginBottom: 4 },
  label: {
    color: '#617067',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5ECE8',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#14221C',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  err: { color: '#D64545', fontSize: 12, fontWeight: '600', marginTop: 6 },

  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  linkRow: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  linkMuted: { color: '#617067', fontSize: 13, fontWeight: '500' },
  linkText: { fontWeight: '800' },
  ctaLoadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  cooldownBox: {
    marginTop: 16, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,132,0,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,132,0,0.35)',
    alignItems: 'center',
  },
  cooldownTitle: { color: '#14221C', fontSize: 14, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  cooldownBody: { color: '#617067', fontSize: 13, fontWeight: '500', textAlign: 'center', marginBottom: 12 },
  cooldownBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  cooldownBtnText: { fontSize: 14, fontWeight: '800' },
});
