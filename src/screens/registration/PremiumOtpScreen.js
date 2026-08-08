// PremiumOtpScreen — Stage 35.
//
// Шаг 2 нового регистрационного потока: 4-значный SMS-код.
// Заменяет логику step=1.code старого RegScreen и code-step старого
// AuthScreen. Никаких WhatsApp-каналов, никаких Telegram-fallback —
// только SMS (Mobizon в проде, mock в dev).
//
// Дизайн: 4 OTP-ячейки 56×64, role-aware glow, маска +7747***118,
// таймер «повторно через NN», кнопка «Подтвердить» — единственный CTA.

import React, { useState, useEffect, useRef } from 'react';
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
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { push } from '../../utils/push';
import { formatCooldown } from '../../utils/formatCooldown';

const ACCENT = {
  driver: { main: '#168759', deep: '#0F6B47', soft: '#E8F6EF', glow: 'rgba(22,135,89,0.18)' },
  client: { main: '#168759', deep: '#0F6B47', soft: '#E8F6EF', glow: 'rgba(22,135,89,0.18)' },
};

const CODE_LEN = 4;
const RESEND_SECS = 60;

const maskPhone = (raw) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 5) return raw || '';
  const head = '+' + digits.slice(0, 4); // +7747
  const tail = digits.slice(-3);
  return `${head}***${tail}`;
};

export default function PremiumOtpScreen({ navigation, route }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { signIn, setRole, refreshLevel } = useAuth();
  // Stage 37: mode='register' (default) | 'login'.
  // В login-режиме не требуется role и после verify мы вызываем
  // regAPI.me() — если backend помнит роль, сразу в Main; иначе в Role.
  const mode = route?.params?.mode === 'login' ? 'login' : 'register';
  const role = route?.params?.role === 'client' ? 'client' : 'driver';
  const phone = route?.params?.phone || '+7';
  const initialMockCode = route?.params?.mockCode || null;
  // Login screen — нейтральный зелёный (driver-glow), он же accent для
  // авторизации без выбора роли. В register-режиме — role-based.
  const accent = mode === 'login' ? ACCENT.driver : ACCENT[role];

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECS);
  const [error, setError] = useState('');
  const [mockCode, setMockCode] = useState(initialMockCode);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus?.(), 250);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const onChangeCode = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LEN);
    setCode(digits);
    setError('');
    if (digits.length === CODE_LEN) {
      // авто-submit когда введены все 4 цифры
      verify(digits);
    }
  };

  const verify = async (codeArg) => {
    const c = codeArg || code;
    if (loading) return;
    if (c.length < CODE_LEN) {
      setError(t('prem_reg_otp_wrong'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await regAPI.verifyCode(phone, c);
      if (r.cooldown) {
        // Stage 40: слишком много verify-попыток. Не показываем raw
        // detail; просто блокируем ввод на оставшийся cooldown.
        setSecondsLeft(r.cooldown_sec || 60);
        setError(t('prem_reg_otp_wrong'));
        setCode('');
        return;
      }
      if (!r.token) {
        setError(t('prem_reg_otp_wrong'));
        setCode('');
        return;
      }
      await signIn(phone, r.verification_level || 1);
      push.autoRegister?.().catch(() => {});
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[PremiumOtp] verify ok', { mode, hasRole: !!r.role, role: r.role, level: r.verification_level });
      }

      if (mode === 'login') {
        // Login: backend может вернуть role сразу, либо потребовать /me.
        let detectedRole = r.role && r.role !== 'guest' ? r.role : null;
        if (!detectedRole) {
          try {
            const me = await regAPI.me();
            if (me?.role && me.role !== 'guest') detectedRole = me.role;
          } catch {}
        }
        if (detectedRole) {
          setRole(detectedRole);
          await refreshLevel?.().catch(() => {});
          navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role: detectedRole } }] });
        } else {
          // Существующий phone, но роли нет — отправим в Role,
          // оттуда пользователь выберет driver/client и попадёт в
          // PremiumProfile (без повторного SMS — token уже есть).
          if (typeof console !== 'undefined') {
            console.warn('[PremiumOtp] login: no role on backend, redirecting to Role');
          }
          navigation.reset({ index: 0, routes: [{ name: 'Role' }] });
        }
        return;
      }

      // mode === 'register'
      // Stage 41: phone — это identity. Если backend отдал role !== guest,
      // значит этот phone уже зарегистрирован. Открываем СУЩЕСТВУЮЩИЙ
      // аккаунт (с его сохранённой ролью), а не создаём дубликат.
      // Если выбранная пользователем role на RoleScreen отличается от
      // существующей — мягко поясняем toast'ом.
      if (r.role && r.role !== 'guest') {
        if (r.role !== role) {
          try { toast(t('prem_reg_existing_account'), 'info', 3500); } catch {}
        }
        setRole(r.role);
        navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role: r.role } }] });
      } else {
        navigation.replace('RegProfile', { role, phone });
      }
    } catch (e) {
      setError(t('prem_reg_otp_wrong'));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (resending || secondsLeft > 0) return;
    setResending(true);
    setError('');
    try {
      const r = await regAPI.sendCode(phone, 'sms', { consent: true, role });
      if (r.sent || r.ok) {
        setSecondsLeft(RESEND_SECS);
        if ((r.mock || r.beta) && r.code) setMockCode(r.code);
        toast('💬 ' + t('prem_reg_send_code'), 'success', 2500);
      } else if (r.cooldown) {
        // Stage 40: backend rate-limit. Не показываем raw "Подожди NNN сек";
        // вместо этого ставим resend-таймер на оставшийся cooldown и
        // пользователь видит обратный отсчёт MM:SS как обычный resend.
        setSecondsLeft(r.cooldown_sec || RESEND_SECS);
        setError('');
      } else {
        setError(t('prem_reg_send_failed_friendly'));
      }
    } catch (e) {
      setError(t('prem_reg_send_failed_friendly'));
    } finally {
      setResending(false);
    }
  };

  const onChangeNumber = () => {
    navigation.goBack();
  };

  const cells = Array.from({ length: CODE_LEN }, (_, i) => i);
  const phoneMasked = maskPhone(phone);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="prem-reg-otp-screen">
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
              testID="prem-reg-otp-back"
              style={s.backBtn}
            >
              <Text style={s.backIcon}>←</Text>
            </Pressable>
            <View style={[s.roleBadge, { backgroundColor: accent.soft, borderColor: accent.main, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Feather
                name={mode === 'login' ? 'lock' : (role === 'driver' ? 'truck' : 'package')}
                size={14}
                color={accent.main}
              />
              <Text style={[s.roleBadgeText, { color: accent.main }]}>
                {mode === 'login'
                  ? t('login_action')
                  : (role === 'driver' ? t('role_driver') : t('role_shipper'))}
              </Text>
            </View>
          </View>

          <Text style={s.title}>{t('prem_reg_otp_title')}</Text>
          <Text style={s.subtitle}>
            {t('prem_reg_otp_subtitle')}{'\n'}
            <Text style={s.phoneNum}>{phoneMasked}</Text>
          </Text>

          <Pressable onPress={() => inputRef.current?.focus?.()}>
            <View style={s.cellsRow} testID="prem-reg-otp-cells">
              {cells.map((i) => {
                const ch = code[i];
                const filled = !!ch;
                const active = i === code.length;
                return (
                  <View
                    key={i}
                    style={[
                      s.cell,
                      filled && { borderColor: accent.main, backgroundColor: accent.soft },
                      active && {
                        borderColor: accent.main,
                        shadowColor: accent.main,
                        shadowOpacity: 0.6,
                        shadowRadius: 12,
                      },
                      error && { borderColor: '#D64545' },
                    ]}
                    testID={`prem-reg-otp-input-${i}`}
                  >
                    <Text style={s.cellText}>{ch || ''}</Text>
                  </View>
                );
              })}
            </View>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={onChangeCode}
              keyboardType="number-pad"
              // Stage 46: numeric keypad на web независимо от
              // системной раскладки. autoComplete="one-time-code" —
              // iOS/Safari автоподставит SMS-OTP когда код придёт.
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={CODE_LEN}
              style={s.hiddenInput}
              autoFocus
              testID="prem-reg-otp-input"
            />
          </Pressable>

          {error ? <Text style={s.err}>{error}</Text> : null}

          {mockCode ? (
            <View style={[s.mockBanner, { backgroundColor: accent.soft, borderColor: accent.main, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Feather name="unlock" size={14} color={accent.main} />
              <Text style={[s.mockText, { color: accent.main }]}>Mock: {mockCode}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => verify()}
            disabled={loading || code.length < CODE_LEN}
            testID="prem-reg-otp-confirm"
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: accent.main },
              pressed && { opacity: 0.85 },
              (loading || code.length < CODE_LEN) && { opacity: 0.45 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>{t('prem_reg_otp_confirm')}</Text>
            )}
          </Pressable>

          <View style={s.bottomRow}>
            {secondsLeft > 0 ? (
              <Text style={s.timer} testID="prem-reg-otp-resend-timer">
                {(t('prem_otp_resend_locked') || '').replace('{time}', formatCooldown(secondsLeft))}
              </Text>
            ) : (
              <Pressable
                onPress={onResend}
                disabled={resending}
                testID="prem-reg-otp-resend"
                style={s.resendBtn}
              >
                {resending ? (
                  <ActivityIndicator color={accent.main} />
                ) : (
                  <Text style={[s.resendText, { color: accent.main }]}>{t('prem_reg_otp_resend')}</Text>
                )}
              </Pressable>
            )}

            <Pressable
              onPress={onChangeNumber}
              testID="prem-reg-otp-change"
              style={s.changeBtn}
            >
              <Text style={s.changeText}>{t('prem_reg_otp_change')}</Text>
            </Pressable>

            {secondsLeft > 0 ? (
              <Text style={s.noCodeHint} testID="prem-reg-otp-no-code-hint">
                {t('prem_otp_no_code_hint')}
              </Text>
            ) : null}
          </View>
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
  roleBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },

  title: {
    color: '#14221C',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#617067',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 22,
    marginBottom: 28,
  },
  phoneNum: { color: '#14221C', fontWeight: '800' },

  cellsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  cell: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5ECE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    color: '#14221C',
    fontSize: 28,
    fontWeight: '900',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1, height: 1,
    color: 'transparent',
  },

  err: {
    color: '#D64545',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },

  mockBanner: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  mockText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  bottomRow: {
    alignItems: 'center',
    marginTop: 18,
    gap: 12,
  },
  timer: { color: '#617067', fontSize: 13, fontWeight: '600' },
  resendBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  resendText: { fontSize: 14, fontWeight: '800' },
  changeBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  changeText: { color: '#6B7A71', fontSize: 13, fontWeight: '600' },
  noCodeHint: {
    color: '#6B7A71',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 16,
  },
});
