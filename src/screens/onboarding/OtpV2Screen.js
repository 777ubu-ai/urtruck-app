// OtpV2Screen — light-style OTP confirmation (RC2 auth-flow).
//
// Reference: docs/design/rc2-auth-flow/01-otp-light-reference.png
//   Title "Подтверждение" (h1 navy)
//   "Введите код из SMS" — subtitle slate
//   "Код отправлен на +7 747 *** 118" — phone hint
//   4 input boxes (white, navy outline, active = green-left + cursor)
//   Green CTA "Подтвердить"
//   Resend timer 00:59 grey, "Изменить номер" green link
//   Help text italic small below
//
// Бизнес-логика: regAPI.verifyCode (cooldown handling), signIn, после
// verify — если backend знает role → reset Main; иначе reset RoleV2.
//
// Канал: route.params.channel = 'phone' (по умолчанию) | 'email'.
// Для email идентификатор берётся из route.params.email, verify/resend
// идут через regAPI.verifyEmailCode / sendEmailCode. Телефонный путь
// не тронут — просто ветвление по channel.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AppState,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import { push } from '../../utils/push';
import { brand, useBrand, radius, typography } from '../../theme/brandV2';

const CODE_LEN = 4;
const RESEND_SECS = 60;

const formatTimer = (n) => {
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const maskPhone = (raw) => {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length < 7) return raw || '';
  // +7 747 *** 118  — оставляем код страны (1), код оператора (3),
  // последние 3 цифры; середину прячем звёздами.
  const country = d.slice(0, 1);
  const operator = d.slice(1, 4);
  const last3 = d.slice(-3);
  return `+${country} ${operator} *** ${last3}`;
};

// jo***@qq.com — оставляем первые 2 символа локальной части и домен.
const maskEmail = (raw) => {
  const e = (raw || '').trim();
  const at = e.indexOf('@');
  if (at < 1) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at);
  const head = local.slice(0, 2);
  return `${head}***${domain}`;
};

export default function OtpV2Screen({ navigation, route }) {
  const _b = useBrand();
  const s = React.useMemo(() => makeStyles(_b), [_b]);
  const { t } = useI18n();
  const { toast } = useToast();
  const { signIn, setRole, refreshLevel } = useAuth();

  const channel = route?.params?.channel === 'email' ? 'email' : 'phone';
  const isEmail = channel === 'email';
  const phone = route?.params?.phone || '+7';
  const emailAddr = route?.params?.email || '';
  // Единый идентификатор для verify/signIn (телефон или e-mail).
  const identifier = isEmail ? emailAddr : phone;
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

  // Возврат из Mail-приложения → возвращаем фокус на скрытое поле,
  // чтобы iOS показал системную подсказку «Из "Сообщения": XXXX».
  // Без этого пользователь возвращался с кодом в буфере, но фокуса на
  // поле не было и подсказка не появлялась.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTimeout(() => inputRef.current?.focus?.(), 150);
      }
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  // «Открыть почту» — универсальный deeplink на почтовый клиент.
  // iOS: message:// (Apple Mail) с fallback на Gmail / Outlook.
  // Android: mailto: → системный picker. Web: no-op (у пользователя браузер).
  const openMailApp = async () => {
    if (Platform.OS === 'web') return;
    const targets = Platform.OS === 'ios'
      ? ['message://', 'googlegmail://', 'ms-outlook://', 'mailto:']
      : ['mailto:'];
    for (const url of targets) {
      try {
        const can = await Linking.canOpenURL(url);
        if (can) { await Linking.openURL(url); return; }
      } catch {}
    }
  };

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
      const r = isEmail
        ? await regAPI.verifyEmailCode(identifier, c)
        : await regAPI.verifyCode(identifier, c);
      if (r.cooldown) {
        setSecondsLeft(r.cooldown_sec || 60);
        setError(t('otp_v2_wrong'));
        setCode('');
        return;
      }
      if (!r.token) {
        // #round-4 contract fix: a correct OTP code can still legitimately
        // fail identity resolution (duplicate canonical email → fail
        // closed, no session). That is NOT "wrong code" — showing the
        // generic otp_v2_wrong copy here would tell a user with the RIGHT
        // code to keep retyping it forever. Detect the stable machine
        // code and show its own, correctly-localized message instead.
        if (r.detail?.error === 'AMBIGUOUS_EMAIL_IDENTITY') {
          setError(t('auth_error_ambiguous_email'));
          setCode('');
          return;
        }
        setError(t('otp_v2_wrong'));
        setCode('');
        return;
      }
      await signIn(identifier, r.verification_level || 1);
      push.autoRegister?.().catch(() => {});

      // RC2: если backend знает роль — в Main. Иначе на RoleV2.
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
      navigation.reset({
        index: 0,
        routes: [{ name: 'RoleV2', params: { phone: identifier, channel, email: emailAddr } }],
      });
    } catch (e) {
      // 7.4: сетевой сбой (fetch throw) ≠ неверный код. На 3G в рейсе водитель
      // тыкал код, думая что ошибся, а это отвалилась связь. Разводим.
      setError(t('no_connection'));
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
      const r = isEmail
        ? await regAPI.sendEmailCode(identifier, { consent: true })
        : await regAPI.sendCode(identifier, 'sms', { consent: true });
      if (r.sent || r.ok) {
        setSecondsLeft(RESEND_SECS);
        if ((r.mock || r.beta) && r.code) setMockCode(r.code);
        try { toast(t('otp_v2_resent'), 'success', 2000); } catch {}
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

  const onChangePhone = () => navigation.goBack();

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="otp-v2-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
            testID="otp-v2-back"
            accessibilityRole="button"
            accessibilityLabel="back"
          >
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>{t('otp_v2_title')}</Text>
          <Text style={s.subtitle}>
            {isEmail ? t('otp_v2_subtitle_email') : t('otp_v2_subtitle')}
          </Text>
          <Text style={s.phoneHint}>
            {t('otp_v2_sent_to')}{' '}
            <Text style={s.phoneStrong}>
              {isEmail ? maskEmail(identifier) : maskPhone(identifier)}
            </Text>
          </Text>

          <Pressable
            onPress={() => inputRef.current?.focus?.()}
            style={s.cellsRow}
            testID="otp-v2-cells"
            accessibilityRole="text"
          >
            {Array.from({ length: CODE_LEN }, (_, i) => {
              const filled = code.length > i;
              const focused = code.length === i;
              return (
                <View
                  key={i}
                  style={[
                    s.cell,
                    focused && !error && s.cellFocused,
                    filled && !error && s.cellFilled,
                    error && s.cellError,
                  ]}
                >
                  <Text style={s.cellText}>{code[i] || ''}</Text>
                  {focused && !error ? <View style={s.cellCaret} /> : null}
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
            // oneTimeCode + one-time-code = стандарт для iOS/Android/Web:
            // системная подсказка после прихода письма (iOS Mail →
            // клавиатура QuickBar подсовывает код автоматически). Раньше
            // стоял autoComplete="sms-otp" — только Android SMS, для email
            // не работало.
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            importantForAutofill="yes"
            testID="otp-v2-input"
            editable={!loading}
          />

          {error ? <Text style={s.errorText}>{error}</Text> : null}
          {mockCode ? (
            <Text style={s.mockHint}>
              {t('otp_v2_mock_hint')}: <Text style={s.mockCode}>{mockCode}</Text>
            </Text>
          ) : null}

          <Pressable
            onPress={() => verify()}
            disabled={loading || code.length < CODE_LEN}
            accessibilityRole="button"
            testID="otp-v2-cta"
            style={({ pressed }) => [
              s.ctaPrimary,
              {
                backgroundColor:
                  code.length < CODE_LEN ? brand.borderStrong : brand.primary,
              },
              pressed && code.length === CODE_LEN && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={s.ctaPrimaryText}>{t('otp_v2_cta')}</Text>
            )}
          </Pressable>

          {isEmail && Platform.OS !== 'web' && (
            <Pressable
              onPress={openMailApp}
              testID="otp-v2-open-mail"
              accessibilityRole="button"
              style={({ pressed }) => [s.openMailBtn, pressed && { opacity: 0.7 }]}
            >
              <Feather name="mail" size={16} color={brand.primary} />
              <Text style={s.openMailText}>{t('otp_v2_open_mail') || 'Открыть почту'}</Text>
            </Pressable>
          )}

          <View style={s.resendBlock}>
            {secondsLeft > 0 ? (
              <Text style={s.resendDisabled}>
                {t('otp_v2_resend_in').replace('{time}', formatTimer(secondsLeft))}
              </Text>
            ) : (
              <Pressable
                onPress={onResend}
                disabled={resending}
                testID="otp-v2-resend"
                accessibilityRole="button"
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={s.resendActive}>
                  {resending ? t('otp_v2_resending') : t('otp_v2_resend')}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={onChangePhone}
              testID="otp-v2-change-phone"
              accessibilityRole="button"
              style={({ pressed }) => [s.changeBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={s.changeText}>
                {isEmail ? t('otp_v2_change_email') : t('otp_v2_change_phone')}
              </Text>
            </Pressable>
          </View>

          <Text style={s.helpText}>{t('otp_v2_help')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  // 44×44 — iOS HIG minimum tappable + видимая рамка (не «прозрачный» back
  // как раньше, когда юзер не понимал где ткнуть).
  backBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 22,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    marginBottom: 16,
  },
  phoneHint: {
    ...typography.body,
    color: brand.textSecondary,
    marginBottom: 24,
  },
  phoneStrong: {
    color: brand.textPrimary,
    fontWeight: '700',
  },
  cellsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cell: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFocused: {
    borderColor: brand.primary,
    borderLeftWidth: 3,
  },
  cellFilled: {
    borderColor: brand.primary,
  },
  cellError: {
    borderColor: brand.error,
  },
  cellText: {
    fontSize: 28,
    fontWeight: '900',
    color: brand.textPrimary,
  },
  cellCaret: {
    position: 'absolute',
    width: 2,
    height: 28,
    backgroundColor: brand.primary,
    top: 18,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1, height: 1,
    opacity: 0,
  },
  errorText: {
    color: brand.error,
    ...typography.bodySmall,
    fontWeight: '600',
    marginBottom: 4,
  },
  mockHint: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    marginBottom: 4,
  },
  mockCode: {
    fontWeight: '900',
    color: brand.textPrimary,
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
  openMailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: brand.primary,
    backgroundColor: 'transparent',
    marginTop: 10,
  },
  openMailText: {
    color: brand.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  resendBlock: {
    alignItems: 'center',
    marginTop: 18,
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
    paddingVertical: 8,
    marginTop: 6,
  },
  changeText: {
    ...typography.body,
    color: brand.primary,
    fontWeight: '700',
  },
  helpText: {
    ...typography.bodySmall,
    color: brand.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 18,
    fontStyle: 'italic',
  },
});
