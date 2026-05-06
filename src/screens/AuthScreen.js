import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { regAPI } from '../utils/registration';
import { push } from '../utils/push';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import HeroTruck from '../components/ui/v1/HeroTruck';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import ConsentRow from '../components/ConsentRow';
import {v1Colors, useV1Colors, v1Spacing, v1Typography, v1Radius} from '../theme/designV1';

// AuthScreen — design v1, screen 04 (OTP). Two visual states:
//   step="phone"  — enter phone & pick channel (Telegram / SMS)
//   step="code"   — verify the OTP
//
// Logic preserved verbatim from the previous implementation: regAPI.sendCode,
// regAPI.verifyCode, signIn(...) → navigation.replace 'Reg'/'Role'/'Main'.
// We keep the live 4-digit code length (the backend rejects 6) but render
// the OTP cells in the macro-04 layout regardless of length.

const CODE_LEN = 4;
const RESEND_SECS = 32;

export default function AuthScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  title: { ...v1Typography.h1, textAlign: 'center', marginTop: v1Spacing.md },
  subtitle: { ...v1Typography.bodyMd, textAlign: 'center', marginTop: 6, marginBottom: v1Spacing.md },

  phoneRow: { marginBottom: v1Spacing.sm },
  phoneInput: {
    backgroundColor: v1.surface,
    borderColor: v1.border,
    borderWidth: 1,
    borderRadius: v1Radius.field,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: v1.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2,
  },
  altLabel: { color: v1.textMuted, fontSize: 12, textAlign: 'center', marginVertical: v1Spacing.md },

  channelBtn: {
    height: 54, borderRadius: v1Radius.button,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  channelText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: v1Spacing.md },
  otpCell: {
    flex: 1, aspectRatio: 1, maxWidth: 50,
    backgroundColor: v1.surface,
    borderColor: v1.border, borderWidth: 1,
    borderRadius: v1Radius.field,
    alignItems: 'center', justifyContent: 'center',
  },
  otpCellFilled: { borderColor: v1Colors.driver },
  otpCellActive: { borderColor: v1Colors.driver, shadowColor: v1Colors.driver, shadowOpacity: 0.6, shadowRadius: 8 },
  otpDigit: { color: v1.text, fontSize: 22, fontWeight: '900' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },

  timer: { color: v1.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  changeRow: { alignItems: 'center', marginTop: 8, paddingVertical: 6 },
  changeText: { color: v1Colors.driver, fontSize: 13, fontWeight: '700' },

  mockBanner: {
    borderColor: v1Colors.driver, borderWidth: 1, borderRadius: v1Radius.field,
    padding: 10, alignItems: 'center', marginVertical: 8,
    backgroundColor: v1Colors.driverSoft,
  },
  mockText: { color: v1Colors.driver, fontSize: 14, fontWeight: '800' },

  tgRow: { alignItems: 'center', marginVertical: 6 },
  tgText: { color: '#0088CC', fontSize: 13, fontWeight: '700' },

  err: { color: v1Colors.error, fontSize: 12, textAlign: 'center', marginTop: 6 },

  resendRow: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  resendText: { color: v1Colors.driver, fontSize: 13, fontWeight: '700' },
  securityNote: { color: v1.textMuted, fontSize: 12, textAlign: 'center', marginTop: v1Spacing.lg },

  }), [v1]);
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const { toast } = useToast();
  const role = route?.params?.role || null;

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState(route?.params?.phone || '+7');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState('');
  const [mockCode, setMockCode] = useState(null);
  const [deeplink, setDeeplink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Stage 24: legal consent gate. SMS не отправляется без галочки;
  // backend это тоже валидирует, но UI не даёт даже нажать кнопку
  // — иначе пользователь видит 400 без объяснения.
  const [consent, setConsent] = useState(false);
  const codeInputRef = useRef(null);

  const digits = phone.replace(/\D/g, '');
  const validPhone = digits.length >= 10;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const sendOTP = async (ch) => {
    if (!validPhone) { setError(t('reg_enter_phone')); return; }
    if (!consent) { setError(t('registration_consent_required')); return; }
    setChannel(ch);
    setLoading(true);
    setError('');
    setMockCode(null);
    setDeeplink(null);
    try {
      const r = await regAPI.sendCode(phone, ch, { consent: true, role });
      if ((r.mock || r.beta) && r.code) setMockCode(r.code);
      if (r.deeplink) setDeeplink(r.deeplink);
      if (r.fallback) {
        setChannel(r.channel || 'telegram');
        toast(`${ch} → ${r.channel || 'telegram'}`, 'info', 4000);
      }
      setStep('code');
      setSecondsLeft(RESEND_SECS);
      // give the keyboard a beat to settle, then focus
      setTimeout(() => codeInputRef.current?.focus?.(), 200);
    } catch {
      setError(t('send_error'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code.length < CODE_LEN) { setError(t('val_required')); return; }
    setLoading(true);
    setError('');
    try {
      const r = await regAPI.verifyCode(phone, code);
      if (r.token) {
        signIn(phone, r.verification_level || 1);
        toast(r.beta ? '✅ Beta' : '✅ ' + t('login_action'), 'success');
        push.autoRegister?.().catch(() => {});
        if (r.beta && r.role && r.role !== 'guest') {
          setRole(r.role);
          navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role: r.role } }] });
        } else if (role) {
          navigation.replace('Reg', { role });
        } else {
          navigation.replace('Role');
        }
      } else {
        setError(r.detail || t('val_required'));
      }
    } catch {
      setError(t('generic_error'));
    } finally {
      setLoading(false);
    }
  };

  const cells = Array.from({ length: 6 }).map((_, i) => i); // visual cells per macro
  const phoneMasked = phone.replace(/^(\+?\d+)(\d{2})$/, (_, head, tail) => `${head.replace(/\d(?=\d{4})/g, '*')}-**-${tail}`);

  return (
    <Screen>
      <BrandHeader onBack={() => (step === 'code' ? (setStep('phone'), setCode('')) : navigation.goBack())} />
      <HeroTruck size="sm" />

      {step === 'phone' ? (
        <>
          {/* Stage 34: реальный заголовок "Вход в аккаунт" вместо
              генерического "Телефон". Пользователь после tap'а
              "Войти" на RoleScreen сразу видит контекст. */}
          <Text style={s.title}>{t('auth_screen_title_login')}</Text>
          <Text style={s.subtitle}>{t('signup_field_phone')} +7 (***) ***-**-**</Text>

          <View style={s.phoneRow}>
            <TextInput
              style={s.phoneInput}
              value={phone}
              onChangeText={(v) => { setPhone(v); setError(''); }}
              keyboardType="phone-pad"
              autoFocus
              placeholder="+7 777 123 45 67"
              placeholderTextColor={v1.placeholder}
            />
          </View>
          {error ? <Text style={s.err}>{error}</Text> : null}

          <Text style={s.altLabel}>{t('signup_alt')}</Text>
          {/* Stage 24: compact legal-consent block. CTA buttons
              ниже остаются disabled, пока галочка не отмечена. */}
          <ConsentRow checked={consent} onChange={setConsent} accent={v1Colors.driver} />
          <TouchableOpacity
            style={[s.channelBtn, { backgroundColor: '#0088CC' }, (!consent || !validPhone || loading) && { opacity: 0.45 }]}
            disabled={!validPhone || loading || !consent}
            onPress={() => sendOTP('telegram')}
            activeOpacity={0.85}
          >
            {loading && channel === 'telegram'
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.channelText}>✈️  Telegram</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.channelBtn, { backgroundColor: v1Colors.driver }, (!consent || !validPhone || loading) && { opacity: 0.45 }]}
            disabled={!validPhone || loading || !consent}
            onPress={() => sendOTP('sms')}
            activeOpacity={0.85}
          >
            {loading && channel === 'sms'
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.channelText}>📱  SMS</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.title}>{t('otp_title')}</Text>
          <Text style={s.subtitle}>{t('otp_subtitle')} {phoneMasked}</Text>

          {/* Visual OTP grid. The actual TextInput is offscreen but bound
              to the same `code` value, so the user types naturally. */}
          <View style={s.otpRow}>
            {cells.map((i) => {
              const ch = code[i] || '';
              const isFirstEmpty = !ch && i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    s.otpCell,
                    ch ? s.otpCellFilled : null,
                    isFirstEmpty ? s.otpCellActive : null,
                  ]}
                >
                  <Text style={s.otpDigit}>{ch}</Text>
                </View>
              );
            })}
          </View>
          <TextInput
            ref={codeInputRef}
            style={s.hiddenInput}
            value={code}
            onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, CODE_LEN)); setError(''); }}
            keyboardType="number-pad"
            maxLength={CODE_LEN}
            autoFocus
          />

          <Text style={s.timer}>
            {secondsLeft > 0
              ? `${t('otp_resend_in')} 00:${String(secondsLeft).padStart(2, '0')}`
              : t('otp_no_code')}
          </Text>

          <TouchableOpacity onPress={() => { setStep('phone'); setCode(''); setError(''); }} style={s.changeRow}>
            <Text style={s.changeText}>{t('otp_change_number')}</Text>
          </TouchableOpacity>

          {mockCode ? (
            <View style={s.mockBanner}>
              <Text style={s.mockText}>🧪 {mockCode}</Text>
            </View>
          ) : null}

          {channel === 'telegram' && deeplink ? (
            <TouchableOpacity onPress={() => Linking.openURL(deeplink).catch(() => {})} style={s.tgRow}>
              <Text style={s.tgText}>✈️ Telegram →</Text>
            </TouchableOpacity>
          ) : null}

          {error ? <Text style={s.err}>{error}</Text> : null}

          <PrimaryButton
            label={t('otp_submit')}
            onPress={verify}
            loading={loading}
            disabled={code.length < CODE_LEN}
            testID="otp-submit"
            style={{ marginTop: v1Spacing.md }}
          />

          <TouchableOpacity
            onPress={() => secondsLeft === 0 && sendOTP(channel || 'telegram')}
            style={s.resendRow}
            disabled={secondsLeft > 0}
          >
            <Text style={[s.resendText, secondsLeft > 0 && { opacity: 0.4 }]}>{t('otp_resend')}</Text>
          </TouchableOpacity>

          <Text style={s.securityNote}>🛡  {t('otp_security_note')}</Text>
        </>
      )}
    </Screen>
  );
}

