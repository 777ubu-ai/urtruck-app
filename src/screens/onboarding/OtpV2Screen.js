// OtpV2Screen — inDrive-style ввод OTP-кода.
//
// Бизнес-логика 1-в-1 с PremiumOtpScreen.js (verify через regAPI,
// cooldown handling, mode='register'|'login', существующий аккаунт →
// в Main, новый → дальше в Role flow). UI полностью переделан под
// brandV2: белый фон, navy текст, зелёный CTA.
//
// Развилка после verify (RC2 flow):
//   • backend вернул role !== 'guest'  → setRole + reset Main
//   • backend вернул role 'guest'/null → reset to RoleV2 (новый flow,
//     batch 2 — выбор роли пост-OTP, после него ProfileDriver/Client)
//   • в mode='login' с существующим аккаунтом — то же самое
//
// SMS autofill (iOS):
//   textContentType="oneTimeCode" + autoComplete="sms-otp" — iOS
//   подхватывает код из верифицированного источника.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import * as push from '../../utils/push';
import { brand, radius, typography } from '../../theme/brandV2';

const CODE_LEN = 4;
const RESEND_SECS = 60;

const formatTimer = (n) => {
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const maskPhone = (raw) => {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length < 5) return raw || '';
  return `+${d.slice(0, 4)} ••• ${d.slice(-3)}`;
};

export default function OtpV2Screen({ navigation, route }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { signIn, setRole, refreshLevel } = useAuth();

  const mode = route?.params?.mode === 'login' ? 'login' : 'register';
  const phone = route?.params?.phone || '+7';
  const initialMockCode = route?.params?.mockCode || null;

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
      verify(digits);
    }
  };

  const verify = async (codeArg) => {
    const c = codeArg || code;
    if (loading) return;
    if (c.length < CODE_LEN) {
      setError(t('otp_v2_wrong'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await regAPI.verifyCode(phone, c);
      if (r.cooldown) {
        setSecondsLeft(r.cooldown_sec || 60);
        setError(t('otp_v2_wrong'));
        setCode('');
        return;
      }
      if (!r.token) {
        setError(t('otp_v2_wrong'));
        setCode('');
        return;
      }
      await signIn(phone, r.verification_level || 1);
      push.autoRegister?.().catch(() => {});

      // RC2 routing: если backend знает роль — в Main. Иначе на RoleV2
      // (новый post-OTP экран выбора). В login/register режимах логика
      // одинаковая (phone = identity).
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
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main', params: { role: detectedRole } }],
        });
        return;
      }

      // Новый юзер (или существующий без роли) → выбор роли пост-OTP.
      navigation.reset({
        index: 0,
        routes: [{ name: 'RoleV2', params: { phone } }],
      });
    } catch (e) {
      setError(t('otp_v2_wrong'));
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
      const r = await regAPI.sendCode(phone, 'sms', { consent: true });
      if (r.sent || r.ok) {
        setSecondsLeft(RESEND_SECS);
        if ((r.mock || r.beta) && r.code) setMockCode(r.code);
        try { toast('💬 ' + t('otp_v2_resent'), 'success', 2200); } catch {}
      } else if (r.cooldown) {
        setSecondsLeft(r.cooldown_sec || RESEND_SECS);
      } else {
        setError(t('otp_v2_send_failed'));
      }
    } catch (e) {
      setError(t('otp_v2_send_failed'));
    } finally {
      setResending(false);
    }
  };

  const onChangePhone = () => {
    navigation.goBack();
  };

  // 4 видимых ячейки — рисуем как декорации поверх скрытого TextInput.
  const cells = Array.from({ length: CODE_LEN }, (_, i) => i);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="otp-v2-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} testID="otp-v2-back">
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={s.content}>
          <Text style={s.logo}>
            <Text style={{ color: brand.logoDark }}>Ur</Text>
            <Text style={{ color: brand.logoAccent }}>Truck</Text>
          </Text>

          <Text style={s.title}>{t('otp_v2_title')}</Text>
          <Text style={s.subtitle}>
            {t('otp_v2_subtitle')} {maskPhone(phone)}
          </Text>

          {/* Cells */}
          <Pressable
            onPress={() => inputRef.current?.focus?.()}
            style={s.cellsRow}
            testID="otp-v2-cells"
          >
            {cells.map((i) => {
              const filled = code.length > i;
              const focused = code.length === i;
              return (
                <View
                  key={i}
                  style={[
                    s.cell,
                    focused && { borderColor: brand.primary, borderWidth: 2 },
                    filled && { borderColor: brand.textPrimary },
                    error && { borderColor: brand.error },
                  ]}
                >
                  <Text style={s.cellText}>{code[i] || ''}</Text>
                </View>
              );
            })}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            maxLength={CODE_LEN}
            style={s.hiddenInput}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            testID="otp-v2-input"
            editable={!loading}
          />

          {error ? <Text style={s.error}>{error}</Text> : null}
          {mockCode ? (
            <Text style={s.mockHint}>
              {t('otp_v2_mock_hint')}: <Text style={{ fontWeight: '900' }}>{mockCode}</Text>
            </Text>
          ) : null}

          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color={brand.primary} />
              <Text style={s.loadingText}>{t('otp_v2_checking')}</Text>
            </View>
          ) : null}

          {/* Resend */}
          <View style={s.resendBlock}>
            {secondsLeft > 0 ? (
              <Text style={s.resendDisabled}>
                {t('otp_v2_resend_in').replace('{time}', formatTimer(secondsLeft))}
              </Text>
            ) : (
              <TouchableOpacity onPress={onResend} disabled={resending} testID="otp-v2-resend">
                <Text style={s.resendActive}>
                  {resending ? t('otp_v2_resending') : t('otp_v2_resend')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Change phone */}
          <TouchableOpacity
            onPress={onChangePhone}
            style={s.changeBtn}
            testID="otp-v2-change-phone"
          >
            <Feather name="edit-2" size={14} color={brand.textSecondary} />
            <Text style={s.changeText}>{t('otp_v2_change_phone')}</Text>
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'center',
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 24,
    marginBottom: 32,
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
    paddingHorizontal: 20,
  },
  cellsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cell: {
    width: 56,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 28,
    fontWeight: '900',
    color: brand.textPrimary,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1, height: 1,
    opacity: 0,
  },
  error: {
    color: brand.error,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  mockHint: {
    color: brand.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  loadingText: {
    ...typography.body,
    color: brand.textSecondary,
  },
  resendBlock: {
    marginTop: 28,
    alignItems: 'center',
  },
  resendDisabled: {
    ...typography.body,
    color: brand.textTertiary,
  },
  resendActive: {
    ...typography.body,
    color: brand.primary,
    fontWeight: '700',
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeText: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    fontWeight: '600',
  },
});
