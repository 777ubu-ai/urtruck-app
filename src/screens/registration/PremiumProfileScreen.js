// PremiumProfileScreen — the minimum profile before entering UrTruck.
// For a shipper this is intentionally non-skippable: every driver must know
// who the customer is and from which country they are operating.
import React, { useState } from 'react';
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
import { useV1Colors } from '../../theme/designV1';
import { useAuth } from '../../utils/AuthContext';
import { useToast } from '../../components/Toast';
import { saveProfile } from '../../utils/store';
import { regAPI } from '../../utils/registration';

const COPY = {
  RU: {
    country: 'Страна *', countryPlaceholder: 'Например, Китай', countryRequired: 'Укажите страну',
    phone: 'Телефон *', phonePlaceholder: '+86 138 0000 0000', phoneRequired: 'Укажите действующий номер телефона',
    company: 'Компания', companyPlaceholder: 'Название компании (необязательно)',
    requiredHint: 'Имя, страна и телефон обязательны для грузоотправителя.',
  },
  EN: {
    country: 'Country *', countryPlaceholder: 'For example, China', countryRequired: 'Enter your country',
    phone: 'Phone *', phonePlaceholder: '+86 138 0000 0000', phoneRequired: 'Enter a valid phone number',
    company: 'Company', companyPlaceholder: 'Company name (optional)',
    requiredHint: 'Name, country and phone are required for a shipper.',
  },
  ZH: {
    country: '国家 *', countryPlaceholder: '例如：中国', countryRequired: '请输入国家',
    phone: '手机号 *', phonePlaceholder: '+86 138 0000 0000', phoneRequired: '请输入有效手机号',
    company: '公司', companyPlaceholder: '公司名称（选填）',
    requiredHint: '货主必须填写姓名、国家和手机号。',
  },
  KK: {
    country: 'Ел *', countryPlaceholder: 'Мысалы, Қытай', countryRequired: 'Елді көрсетіңіз',
    phone: 'Телефон *', phonePlaceholder: '+86 138 0000 0000', phoneRequired: 'Жарамды телефон нөмірін енгізіңіз',
    company: 'Компания', companyPlaceholder: 'Компания атауы (міндетті емес)',
    requiredHint: 'Жүк иесіне аты, елі және телефоны міндетті.',
  },
};

const digits = (value) => String(value || '').replace(/\D/g, '');

export default function PremiumProfileScreen({ navigation, route }) {
  const c = useV1Colors();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const { t, lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  const { session, setRole, refreshLevel } = useAuth();
  const { toast } = useToast();
  const role = route?.params?.role === 'client' ? 'client' : 'driver';
  const isShipper = role === 'client';
  const accent = { main: c.driver, deep: c.driverDeep, soft: c.driverSoft, glow: c.driverGlow, onAccent: c.driverOnAccent };
  const initialPhone = route?.params?.phone || session?.user?.phone || '';

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validName = name.trim().length >= 2;
  const validCountry = country.trim().length >= 2;
  const validPhone = digits(phone).length >= 10;
  const shipperReady = validName && validCountry && validPhone;
  const ready = isShipper ? shipperReady : validName;

  const enterApp = async (withProfile) => {
    if (loading) return;
    if (!withProfile && isShipper) return;

    if (withProfile) {
      const nextErrors = {};
      if (!validName) nextErrors.name = t('prem_reg_profile_name_short');
      if (isShipper && !validCountry) nextErrors.country = ui.countryRequired;
      if (isShipper && !validPhone) nextErrors.phone = ui.phoneRequired;
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        return;
      }

      const userId = session?.user?.id || ('u_' + Date.now());
      const trimmedName = name.trim();
      const trimmedCity = city.trim();
      const trimmedCountry = country.trim();
      const trimmedCompany = company.trim();
      const trimmedPhone = phone.trim();

      saveProfile(userId, {
        name: trimmedName,
        display_name: trimmedName,
        full_name: trimmedName,
        city: trimmedCity,
        country: trimmedCountry,
        company_name: trimmedCompany,
        role,
        phone: trimmedPhone,
      });

      setLoading(true);
      let response = null;
      try {
        response = await regAPI.updateProfile({
          name: trimmedName,
          city: trimmedCity,
          phone: trimmedPhone || initialPhone || undefined,
          role,
          ...(isShipper ? { country: trimmedCountry, company_name: trimmedCompany } : {}),
        });
      } catch {
        response = null;
      }

      if (!response || response.ok === false) {
        setLoading(false);
        toast(response?.message || response?.detail || t('save_error'), 'error', 4000);
        return;
      }
      try { await refreshLevel(); } catch {}
    } else {
      setLoading(true);
    }

    setRole(role);
    navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="prem-reg-profile-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <View style={[s.roleBadge, { backgroundColor: accent.soft, borderColor: accent.main }]}>
              <Feather name={role === 'driver' ? 'truck' : 'package'} size={14} color={accent.main} />
              <Text style={[s.roleBadgeText, { color: accent.main }]}>
                {role === 'driver' ? t('role_driver') : t('role_shipper')}
              </Text>
            </View>
          </View>

          <Text style={s.title}>{t('prem_reg_profile_title')}</Text>
          <Text style={s.subtitle}>{isShipper ? ui.requiredHint : t('prem_reg_profile_subtitle')}</Text>

          <View style={s.fieldBlock}>
            <Text style={s.label}>{t('prem_reg_profile_name_label')}{isShipper ? ' *' : ''}</Text>
            <TextInput
              value={name}
              onChangeText={(value) => { setName(value); setErrors((prev) => ({ ...prev, name: '' })); }}
              style={[s.input, { borderColor: errors.name ? '#D64545' : (validName ? accent.main : c.border) }]}
              placeholder={t('prem_reg_profile_name_placeholder')}
              placeholderTextColor={c.placeholder}
              autoFocus
              maxLength={64}
              testID="prem-reg-profile-name"
            />
            {errors.name ? <Text style={s.err}>{errors.name}</Text> : null}
          </View>

          {isShipper ? (
            <>
              <View style={s.fieldBlock}>
                <Text style={s.label}>{ui.country}</Text>
                <TextInput
                  value={country}
                  onChangeText={(value) => { setCountry(value); setErrors((prev) => ({ ...prev, country: '' })); }}
                  style={[s.input, { borderColor: errors.country ? '#D64545' : (validCountry ? accent.main : c.border) }]}
                  placeholder={ui.countryPlaceholder}
                  placeholderTextColor={c.placeholder}
                  maxLength={64}
                  autoCapitalize="words"
                  testID="prem-reg-profile-country"
                />
                {errors.country ? <Text style={s.err}>{errors.country}</Text> : null}
              </View>

              <View style={s.fieldBlock}>
                <Text style={s.label}>{ui.phone}</Text>
                <TextInput
                  value={phone}
                  onChangeText={(value) => { setPhone(value); setErrors((prev) => ({ ...prev, phone: '' })); }}
                  style={[s.input, { borderColor: errors.phone ? '#D64545' : (validPhone ? accent.main : c.border) }]}
                  placeholder={ui.phonePlaceholder}
                  placeholderTextColor={c.placeholder}
                  keyboardType="phone-pad"
                  inputMode="tel"
                  maxLength={24}
                  testID="prem-reg-profile-phone"
                />
                {errors.phone ? <Text style={s.err}>{errors.phone}</Text> : null}
              </View>

              <View style={s.fieldBlock}>
                <Text style={s.label}>{ui.company}</Text>
                <TextInput
                  value={company}
                  onChangeText={setCompany}
                  style={[s.input, { borderColor: c.border }]}
                  placeholder={ui.companyPlaceholder}
                  placeholderTextColor={c.placeholder}
                  maxLength={96}
                  testID="prem-reg-profile-company"
                />
              </View>
            </>
          ) : null}

          <View style={s.fieldBlock}>
            <Text style={s.label}>{t('prem_reg_profile_city_label')}</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              style={[s.input, { borderColor: c.border }]}
              placeholder={t('prem_reg_profile_city_placeholder')}
              placeholderTextColor={c.placeholder}
              maxLength={48}
              testID="prem-reg-profile-city"
            />
          </View>

          <Pressable
            onPress={() => enterApp(true)}
            disabled={loading || !ready}
            testID="prem-reg-profile-finish"
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: accent.main },
              pressed && { opacity: 0.85 },
              (loading || !ready) && { opacity: 0.45 },
            ]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{t('prem_reg_profile_finish')}</Text>}
          </Pressable>

          {!isShipper ? (
            <Pressable
              onPress={() => enterApp(false)}
              disabled={loading}
              testID="prem-reg-profile-skip"
              style={s.skipBtn}
            >
              <Text style={s.skipText}>{t('prem_reg_profile_skip')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, marginBottom: 24 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },
  title: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: c.textMuted, fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: 24 },
  fieldBlock: { marginBottom: 14 },
  label: { color: c.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, color: c.text, fontSize: 16, fontWeight: '600' },
  err: { color: '#D64545', fontSize: 12, fontWeight: '600', marginTop: 6 },
  cta: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  skipBtn: { alignItems: 'center', marginTop: 14, paddingVertical: 12 },
  skipText: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
});