// PremiumRegisterScreen — Stage 35.
//
// Шаг 1 нового регистрационного потока: ввод телефона + согласие.
// Заменяет старый RegScreen step=1 (WhatsApp + 5 progress dots).
//
// Дизайн: тёмный фон #0C0A09, role-aware акцент (driver=#22C55E,
// client=#F59E0B), крупный заголовок, поле телефона +7 KZ-маска,
// ConsentRow, single CTA «Получить код». НЕТ Apple/Google, НЕТ
// "WhatsApp", НЕТ степ-баров «Личность/Документы/Транспорт/Готово».

import React, { useState, useMemo, useRef } from 'react';
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
import ConsentRow from '../../components/ConsentRow';

const ACCENT = {
  driver: { main: '#22C55E', deep: '#16A34A', soft: 'rgba(34,197,94,0.12)' },
  client: { main: '#F59E0B', deep: '#D97706', soft: 'rgba(245,158,11,0.12)' },
};

const formatPhone = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  // KZ default: всегда показываем +7 даже если пользователь стёр
  let body = digits;
  if (body[0] === '8') body = '7' + body.slice(1);
  if (body[0] !== '7') body = '7' + body;
  body = body.slice(0, 11);
  const a = body.slice(1, 4);
  const b = body.slice(4, 7);
  const c = body.slice(7, 9);
  const d = body.slice(9, 11);
  let out = '+7';
  if (a) out += ' ' + a;
  if (b) out += ' ' + b;
  if (c) out += ' ' + c;
  if (d) out += ' ' + d;
  return out;
};

export default function PremiumRegisterScreen({ navigation, route }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const role = route?.params?.role === 'client' ? 'client' : 'driver';
  const accent = ACCENT[role];

  const [phone, setPhone] = useState('+7');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const digits = phone.replace(/\D/g, '');
  const validPhone = digits.length === 11 && digits[0] === '7';

  const onChangePhone = (v) => {
    setError('');
    setPhone(formatPhone(v));
  };

  // Stage 36: кнопка ВСЕГДА нажимается (кроме момента загрузки) —
  // валидируем уже внутри. На v85 disabled-prop приводил к тому,
  // что пользователь видел галочку, но `consent` state не успевал
  // обновиться (rn-web Text перехватывал tap у TouchableOpacity)
  // и кнопка оставалась серой. Теперь любая ошибка показывается
  // явно, и владелец сразу видит, что нужно поправить.
  const onSubmit = async () => {
    if (loading) return;
    const normalized = '+' + digits;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[PremiumRegister] canSend', {
        rawPhone: phone,
        normalizedPhone: normalized,
        digitsLen: digits.length,
        validPhone,
        consent,
        role,
        disabledReason:
          loading ? 'loading'
          : !validPhone ? 'phone-invalid'
          : !consent ? 'consent-missing'
          : 'ok',
      });
    }
    if (!validPhone) {
      setError(t('prem_reg_phone_invalid'));
      try { toast(t('prem_reg_phone_invalid'), 'warn'); } catch {}
      inputRef.current?.focus?.();
      return;
    }
    if (!consent) {
      setError(t('registration_consent_required') || t('prem_reg_phone_invalid'));
      try { toast(t('registration_consent_required'), 'warn'); } catch {}
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Stage 33: Mobizon SMS-канал. backend сам выберет провайдера
      // (mobizon prod / mock dev) — UI не управляет каналом.
      // Stage 36: отправляем нормализованный +7XXXXXXXXXX (без пробелов)
      // — пробелы из UI-маски уйдут в backend и сломают Mobizon validation.
      const r = await regAPI.sendCode(normalized, 'sms', { consent: true, role });
      if (r.sent || r.ok) {
        navigation.navigate('RegOtp', {
          role,
          phone: normalized,
          mockCode: r.mock || r.beta ? r.code : null,
        });
      } else {
        setError(r.detail || t('prem_reg_send_failed'));
        try { toast(r.detail || t('prem_reg_send_failed'), 'error'); } catch {}
      }
    } catch (e) {
      setError(t('prem_reg_send_failed'));
      try { toast(t('prem_reg_send_failed'), 'error'); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const title = role === 'driver' ? t('prem_reg_phone_title_driver') : t('prem_reg_phone_title_client');

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="prem-reg-phone-screen">
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
              testID="prem-reg-back"
              style={s.backBtn}
            >
              <Text style={s.backIcon}>←</Text>
            </Pressable>
            <View style={[s.roleBadge, { backgroundColor: accent.soft, borderColor: accent.main }]}>
              <Text style={[s.roleBadgeText, { color: accent.main }]}>
                {role === 'driver' ? '🚛' : '📦'} {role === 'driver' ? t('role_driver') : t('role_shipper')}
              </Text>
            </View>
          </View>

          <View style={s.brandRow}>
            <Text style={s.brand}>UrTruck</Text>
          </View>

          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{t('prem_reg_phone_subtitle')}</Text>

          <View style={s.fieldBlock}>
            <Text style={s.label}>{t('prem_reg_phone_label')}</Text>
            {/* Stage 38: убрана Pressable обёртка вокруг TextInput.
                На rn-web iOS Safari Pressable перехватывает pointerdown
                и иногда блокирует первый focus у TextInput — это и
                могло быть причиной "клавиатура не открывается с первого
                тапа", которое владелец видел на iPhone. */}
            <TextInput
              ref={inputRef}
              value={phone}
              onChangeText={onChangePhone}
              style={[
                s.input,
                { borderColor: error ? '#EF4444' : (validPhone ? accent.main : '#292524') },
              ]}
              placeholder={t('prem_reg_phone_placeholder')}
              placeholderTextColor="#5A6068"
              keyboardType="phone-pad"
              autoFocus
              maxLength={18}
              testID="prem-reg-phone-input"
            />
            {error ? <Text style={s.err}>{error}</Text> : null}
          </View>

          <ConsentRow
            checked={consent}
            onChange={setConsent}
            accent={accent.main}
            testID="prem-reg-consent"
          />

          {/* Stage 36: disabled-prop оставлен только на loading.
              Валидация телефона и consent ушла в onSubmit с явными
              toast/inline ошибками — это и фиксит "кнопка серая,
              но непонятно почему", которая словилась на v85. */}
          <Pressable
            onPress={onSubmit}
            disabled={loading}
            testID="prem-reg-send-code"
            accessibilityRole="button"
            accessibilityState={{ disabled: !!loading }}
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: accent.main },
              pressed && { opacity: 0.85 },
              loading && { opacity: 0.6 },
              (!validPhone || !consent) && !loading && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>{t('prem_reg_send_code')}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Login')}
            testID="prem-reg-have-account"
            style={s.loginRow}
          >
            <Text style={s.loginMuted}>
              {t('prem_reg_already_have')}{' '}
              <Text style={[s.loginLink, { color: accent.main }]}>{t('prem_reg_login_link')}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0C0A09' },
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  backIcon: { color: '#F5F5F5', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  roleBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },

  brandRow: { marginBottom: 24 },
  brand: {
    color: '#F5F5F5',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  title: {
    color: '#F5F5F5',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 28,
  },

  fieldBlock: { marginBottom: 4 },
  label: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F1418',
    borderColor: '#292524',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  err: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },

  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  loginRow: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  loginMuted: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  loginLink: { fontWeight: '800' },
});
