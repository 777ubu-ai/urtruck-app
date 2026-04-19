import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Linking, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { regAPI } from '../utils/registration';
import { accentColors } from '../utils/theme';
import { push } from '../utils/push';

export default function AuthScreen({ navigation, route }) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { signIn } = useAuth();
  const { toast } = useToast();
  const role = route?.params?.role || null;
  const accent = role === 'driver' ? accentColors.driver : accentColors.client;

  const [step, setStep] = useState('phone'); // phone | code
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState('');
  const [mockCode, setMockCode] = useState(null);
  const [deeplink, setDeeplink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const digits = phone.replace(/\D/g, '');
  const validPhone = digits.length >= 10;

  // Отправить код через выбранный канал
  const sendOTP = async (ch) => {
    if (!validPhone) { setError('Введите полный номер телефона'); return; }
    setChannel(ch);
    setLoading(true);
    setError('');
    setMockCode(null);
    setDeeplink(null);
    try {
      const r = await regAPI.sendCode(phone, ch);
      if (r.mock && r.code) setMockCode(r.code);
      if (r.deeplink) setDeeplink(r.deeplink);
      // Если был fallback (WhatsApp/SMS → Telegram)
      if (r.fallback) {
        setChannel(r.channel || 'telegram');
        toast(`${ch === 'whatsapp' ? 'WhatsApp' : 'SMS'} недоступен — код отправлен в Telegram`, 'info', 4000);
      }
      setStep('code');
    } catch (e) {
      setError('Не удалось отправить код');
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
        toast('✅ Вход выполнен', 'success');
        if (push.isSupported()) push.subscribe().catch(() => {});
        if (role) navigation.replace('Reg', { role });
        else navigation.replace('Role');
      } else {
        setError(r.detail || 'Неверный код');
      }
    } catch (e) {
      setError('Ошибка проверки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Back */}
        <TouchableOpacity style={s.back} onPress={() => {
          if (step === 'code') { setStep('phone'); setCode(''); setError(''); setMockCode(null); }
          else navigation.goBack();
        }}>
          <Text style={[s.backText, { color: theme.text }]}>‹ Назад</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={s.logo}>
          <Text style={{ fontSize: 48 }}>🚛</Text>
          <Text style={[s.logoTitle, { color: theme.text }]}>
            {role === 'driver' ? 'Вход водителя' : role === 'client' ? 'Вход отправителя' : 'Вход в UrTruck'}
          </Text>
        </View>

        {step === 'phone' && (
          <>
            {/* Телефон */}
            <Text style={[s.label, { color: theme.textMuted }]}>Номер телефона</Text>
            <TextInput
              style={[s.phoneInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              value={phone}
              onChangeText={(v) => { setPhone(v); setError(''); }}
              placeholder="+7 777 123 45 67"
              placeholderTextColor={theme.textDim}
              keyboardType="phone-pad"
              autoFocus
            />

            {error ? <Text style={s.err}>{error}</Text> : null}

            {/* 3 кнопки каналов — СРАЗУ НА ЭКРАНЕ */}
            <Text style={[s.label, { color: theme.textMuted, marginTop: 20 }]}>Получить код через:</Text>

            <TouchableOpacity
              style={[s.channelBtn, { backgroundColor: '#25D366' }]}
              onPress={() => sendOTP('whatsapp')}
              disabled={!validPhone || loading}
              activeOpacity={0.85}
            >
              {loading && channel === 'whatsapp' ? <ActivityIndicator color="#FFF" /> : (
                <><Text style={s.channelIcon}>💬</Text><Text style={s.channelText}>WhatsApp</Text><Text style={s.channelArrow}>→</Text></>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.channelBtn, { backgroundColor: '#0088CC' }]}
              onPress={() => sendOTP('telegram')}
              disabled={!validPhone || loading}
              activeOpacity={0.85}
            >
              {loading && channel === 'telegram' ? <ActivityIndicator color="#FFF" /> : (
                <><Text style={s.channelIcon}>✈️</Text><Text style={s.channelText}>Telegram</Text><Text style={s.channelArrow}>→</Text></>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.channelBtn, { backgroundColor: '#6B7280' }]}
              onPress={() => sendOTP('sms')}
              disabled={!validPhone || loading}
              activeOpacity={0.85}
            >
              {loading && channel === 'sms' ? <ActivityIndicator color="#FFF" /> : (
                <><Text style={s.channelIcon}>📱</Text><Text style={s.channelText}>SMS</Text><Text style={s.channelArrow}>→</Text></>
              )}
            </TouchableOpacity>

            {!validPhone && (
              <Text style={[s.hint, { color: theme.textDim }]}>
                Введите номер — кнопки станут активными
              </Text>
            )}
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={[s.sentTo, { color: theme.textMuted }]}>
              Код отправлен в {channel === 'whatsapp' ? 'WhatsApp' : channel === 'telegram' ? 'Telegram' : 'SMS'} на {phone}
            </Text>

            {/* Telegram deep link */}
            {channel === 'telegram' && deeplink && (
              <TouchableOpacity
                style={s.tgBtn}
                onPress={() => Linking.openURL(deeplink).catch(() => toast('Не удалось открыть Telegram', 'error'))}
              >
                <Text style={s.tgBtnText}>✈️ Открыть Telegram — получить код</Text>
              </TouchableOpacity>
            )}

            {/* Mock баннер */}
            {mockCode && (
              <View style={[s.mockBanner, { borderColor: accent }]}>
                <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>🧪 DEV · код: {mockCode}</Text>
              </View>
            )}

            {/* Ввод кода */}
            <Text style={[s.label, { color: theme.textMuted, marginTop: 16 }]}>Введите 4-значный код</Text>
            <TextInput
              style={[s.codeInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              value={code}
              onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              placeholder="• • • •"
              placeholderTextColor={theme.textDim}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />

            {error ? <Text style={s.err}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.verifyBtn, { backgroundColor: code.length === 4 ? accent : theme.border }]}
              onPress={verify}
              disabled={code.length !== 4 || loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <Text style={s.verifyBtnText}>Подтвердить</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.resend} onPress={() => { setStep('phone'); setCode(''); setError(''); }}>
              <Text style={[s.resendText, { color: theme.textMuted }]}>← Изменить номер или способ</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  back: { paddingVertical: 8 },
  backText: { fontSize: 15, fontWeight: '600' },

  logo: { alignItems: 'center', marginTop: 20, marginBottom: 30 },
  logoTitle: { fontSize: 22, fontWeight: '800', marginTop: 10 },

  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  phoneInput: { borderWidth: 1.5, borderRadius: 16, padding: 18, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 2 },

  channelBtn: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 14, paddingHorizontal: 18, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
    elevation: 3,
  },
  channelIcon: { fontSize: 22, marginRight: 12 },
  channelText: { color: '#FFF', fontSize: 16, fontWeight: '700', flex: 1 },
  channelArrow: { color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '700' },

  hint: { fontSize: 12, textAlign: 'center', marginTop: 10 },
  err: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginTop: 8 },

  sentTo: { fontSize: 14, textAlign: 'center', marginBottom: 12 },

  tgBtn: {
    backgroundColor: '#0088CC', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
  },
  tgBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  mockBanner: {
    borderWidth: 1, borderRadius: 10, padding: 10,
    alignItems: 'center', marginBottom: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
  },

  codeInput: {
    borderWidth: 1.5, borderRadius: 16, padding: 18,
    fontSize: 32, fontWeight: '800', textAlign: 'center', letterSpacing: 20,
  },

  verifyBtn: { height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  verifyBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  resend: { alignItems: 'center', padding: 14, marginTop: 8 },
  resendText: { fontSize: 13 },
});
