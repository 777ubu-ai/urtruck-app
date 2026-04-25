import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Linking, ActivityIndicator, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { regAPI } from '../utils/registration';
import { DS } from '../utils/theme';
import { push } from '../utils/push';

const LOGO = require('../../assets/logo.jpg');
const IS_BETA = true; // TODO: read from API /api/version

export default function AuthScreen({ navigation, route }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const { toast } = useToast();
  const role = route?.params?.role || null;

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState('');
  const [mockCode, setMockCode] = useState(null);
  const [deeplink, setDeeplink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const digits = phone.replace(/\D/g, '');
  const validPhone = digits.length >= 10;

  const sendOTP = async (ch) => {
    if (!validPhone) { setError('Введите полный номер'); return; }
    setChannel(ch);
    setLoading(true);
    setError('');
    setMockCode(null);
    setDeeplink(null);
    try {
      const r = await regAPI.sendCode(phone, ch);
      if (r.mock && r.code) setMockCode(r.code);
      if (r.beta && r.code) setMockCode(r.code);
      if (r.deeplink) setDeeplink(r.deeplink);
      if (r.fallback) {
        setChannel(r.channel || 'telegram');
        toast(`${ch} недоступен — код в Telegram`, 'info', 4000);
      }
      setStep('code');
    } catch (e) {
      setError(t('send_error'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code.length < 4) { setError('Введите 4 цифры'); return; }
    setLoading(true);
    setError('');
    try {
      const r = await regAPI.verifyCode(phone, code);
      if (r.token) {
        signIn(phone, r.verification_level || 1);
        toast(r.beta ? '✅ Beta-вход' : '✅ Вход выполнен', 'success');
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
        setError(r.detail || 'Неверный код');
      }
    } catch (e) {
      setError(t('generic_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={s.back} onPress={() => {
          if (step === 'code') { setStep('phone'); setCode(''); setError(''); }
          else navigation.goBack();
        }}>
          <Text style={s.backText}>← Назад</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={s.logo}>
          <Image source={LOGO} style={s.logoImg} />
          <Text style={s.logoTitle}>UrTruck</Text>
          <Text style={s.logoSub}>INTERNATIONAL LOGISTICS</Text>
        </View>

        {step === 'phone' && (
          <>
            <Text style={s.label}>НОМЕР ТЕЛЕФОНА</Text>
            <TextInput
              style={[s.input, error && s.inputError]}
              value={phone}
              onChangeText={(v) => { setPhone(v); setError(''); }}
              placeholder="+7 777 123 45 67"
              placeholderTextColor="#475569"
              keyboardType="phone-pad"
              autoFocus
            />
            {error ? <Text style={s.err}>{error}</Text> : null}

            <Text style={[s.label, { marginTop: 24 }]}>ПОЛУЧИТЬ КОД ЧЕРЕЗ</Text>

            {/* Telegram — первый */}
            <TouchableOpacity style={s.channelTg} onPress={() => sendOTP('telegram')} disabled={!validPhone || loading} activeOpacity={0.85}>
              {loading && channel === 'telegram' ? <ActivityIndicator color="#FFF" /> : (
                <><Text style={s.chIcon}>✈️</Text><Text style={s.chText}>Telegram</Text><Text style={s.chArrow}>→</Text></>
              )}
            </TouchableOpacity>

            {/* SMS — второй */}
            <TouchableOpacity style={s.channelSms} onPress={() => sendOTP('sms')} disabled={!validPhone || loading} activeOpacity={0.85}>
              {loading && channel === 'sms' ? <ActivityIndicator color="#FFF" /> : (
                <><Text style={s.chIcon}>📱</Text><Text style={s.chText}>SMS</Text><Text style={s.chArrow}>→</Text></>
              )}
            </TouchableOpacity>

            {/* WhatsApp — скоро */}
            <View style={s.channelWa}>
              <Text style={s.chIcon}>💬</Text>
              <Text style={[s.chText, { color: '#475569' }]}>WhatsApp</Text>
              <View style={s.soonBadge}><Text style={s.soonText}>скоро</Text></View>
            </View>

            {IS_BETA && (
              <Text style={s.betaHint}>🧪 Beta: введите любой номер, код 0000</Text>
            )}

            {!validPhone && <Text style={s.hint}>Введите номер — кнопки станут активными</Text>}
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={s.sentTo}>
              Код отправлен в {channel === 'telegram' ? 'Telegram' : channel === 'sms' ? 'SMS' : channel}
            </Text>

            {channel === 'telegram' && deeplink && (
              <TouchableOpacity style={s.tgBtn} onPress={() => Linking.openURL(deeplink).catch(() => {})}>
                <Text style={s.tgBtnText}>✈️ Открыть Telegram — получить код</Text>
              </TouchableOpacity>
            )}

            {mockCode && (
              <View style={s.mockBanner}>
                <Text style={s.mockText}>🧪 Код: {mockCode}</Text>
              </View>
            )}

            <Text style={[s.label, { marginTop: 16 }]}>ВВЕДИТЕ КОД</Text>
            <TextInput
              style={[s.input, s.codeInput, error && s.inputError]}
              value={code}
              onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              placeholder="• • • •"
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
            {error ? <Text style={s.err}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.verifyBtn, code.length !== 4 && s.verifyBtnDisabled]}
              onPress={verify}
              disabled={code.length !== 4 || loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.verifyBtnText}>Подтвердить</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.resend} onPress={() => { setStep('phone'); setCode(''); setError(''); }}>
              <Text style={s.resendText}>← Изменить номер или способ</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0f1a' },
  scroll: { padding: 20, paddingBottom: 40 },
  back: { paddingVertical: 8 },
  backText: { color: '#94a3b8', fontSize: 14, fontFamily: DS.font.body },

  logo: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  logoImg: { width: 72, height: 72, borderRadius: 18 },
  logoTitle: { fontSize: 32, fontWeight: '800', color: '#ffffff', letterSpacing: -1, marginTop: 12, fontFamily: DS.font.heading },
  logoSub: { fontSize: 11, letterSpacing: 3, color: '#64748b', marginTop: 6, textTransform: 'uppercase', fontFamily: DS.font.body },

  label: { fontSize: 11, fontWeight: '400', color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontFamily: DS.font.body },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center', letterSpacing: 2,
    fontFamily: DS.font.body,
  },
  inputError: { borderColor: '#ef4444' },
  codeInput: { fontSize: 28, letterSpacing: 16, fontWeight: '800' },

  channelTg: {
    flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 12,
    paddingHorizontal: 18, marginBottom: 10, backgroundColor: '#0088CC',
  },
  channelSms: {
    flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 12,
    paddingHorizontal: 18, marginBottom: 10, backgroundColor: '#22c55e',
  },
  channelWa: {
    flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 12,
    paddingHorizontal: 18, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chIcon: { fontSize: 22, marginRight: 12 },
  chText: { color: '#ffffff', fontSize: 16, fontWeight: '600', flex: 1, fontFamily: DS.font.body },
  chArrow: { color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '700' },
  soonBadge: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  soonText: { color: '#475569', fontSize: 11, fontWeight: '600' },

  betaHint: { color: '#22c55e', fontSize: 12, textAlign: 'center', marginTop: 16, fontFamily: DS.font.body },
  hint: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 12, fontFamily: DS.font.body },
  err: { color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 8, fontFamily: DS.font.body },

  sentTo: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 12, fontFamily: DS.font.body },
  tgBtn: { backgroundColor: '#0088CC', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  tgBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600', fontFamily: DS.font.body },
  mockBanner: { borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12, backgroundColor: 'rgba(34,197,94,0.05)' },
  mockText: { color: '#22c55e', fontSize: 14, fontWeight: '700' },

  verifyBtn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  verifyBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.06)' },
  verifyBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600', fontFamily: DS.font.body },

  resend: { alignItems: 'center', padding: 14, marginTop: 8 },
  resendText: { color: '#64748b', fontSize: 13, fontFamily: DS.font.body },
});
