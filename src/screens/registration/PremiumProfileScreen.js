// PremiumProfileScreen — Stage 35.
//
// Шаг 3 нового регистрационного потока: минимальный профиль —
// имя + город. Никаких ИИН/прав/паспорта/ПТС/типа кузова: всё это
// теперь живёт в SecurityScreen → «Подтвердить личность» внутри
// приложения, как опциональное поднятие верификации.
//
// Цель — снизить трение first-run до минимума. Пользователь может
// нажать «Пропустить» и попасть в Main, заполнив профиль позже.

import React, { useState, useMemo } from 'react';
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
import { useAuth } from '../../utils/AuthContext';
import { saveProfile } from '../../utils/store';
import { storage } from '../../utils/storage';
import { API_BASE } from '../../config/env';

const ACCENT = {
  driver: { main: '#22C55E', deep: '#16A34A', soft: 'rgba(34,197,94,0.12)' },
  client: { main: '#F59E0B', deep: '#D97706', soft: 'rgba(245,158,11,0.12)' },
};

export default function PremiumProfileScreen({ navigation, route }) {
  const { t } = useI18n();
  const { session, setRole } = useAuth();
  const role = route?.params?.role === 'client' ? 'client' : 'driver';
  const accent = ACCENT[role];
  const phone = route?.params?.phone || session?.user?.phone || '';

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameErr, setNameErr] = useState('');

  const validName = name.trim().length >= 2;

  const enterApp = async (withProfile) => {
    if (loading) return;
    if (withProfile) {
      if (!validName) {
        setNameErr(t('prem_reg_profile_name_short'));
        return;
      }
      const userId = session?.user?.id || ('u_' + Date.now());
      const cleanName = name.trim();
      const cleanCity = city.trim();
      saveProfile(userId, {
        name: cleanName,
        display_name: cleanName,
        full_name: cleanName,
        city: cleanCity,
        role,
        phone,
      });
      // Bug #4: PATCH /users/me — иначе ProfileScreen на focus получит
      // 200 с пустыми name/city и юзер увидит "Добавить имя" вместо своего.
      try {
        const token = await storage.get('ur_reg_token');
        if (token) {
          await fetch(`${API_BASE}/users/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name: cleanName, city: cleanCity, about: '' }),
          });
        }
      } catch {}
    }
    setLoading(true);
    setRole(role);
    navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="prem-reg-profile-screen">
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
            <View style={[s.roleBadge, { backgroundColor: accent.soft, borderColor: accent.main }]}>
              <Text style={[s.roleBadgeText, { color: accent.main }]}>
                {role === 'driver' ? '🚛' : '📦'} {role === 'driver' ? t('role_driver') : t('role_shipper')}
              </Text>
            </View>
          </View>

          <Text style={s.title}>{t('prem_reg_profile_title')}</Text>
          <Text style={s.subtitle}>{t('prem_reg_profile_subtitle')}</Text>

          <View style={s.fieldBlock}>
            <Text style={s.label}>{t('prem_reg_profile_name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={(v) => { setName(v); setNameErr(''); }}
              style={[
                s.input,
                { borderColor: nameErr ? '#EF4444' : (validName ? accent.main : '#292524') },
              ]}
              placeholder={t('prem_reg_profile_name_placeholder')}
              placeholderTextColor="#5A6068"
              autoFocus
              maxLength={64}
              testID="prem-reg-profile-name"
            />
            {nameErr ? <Text style={s.err}>{nameErr}</Text> : null}
          </View>

          <View style={s.fieldBlock}>
            <Text style={s.label}>{t('prem_reg_profile_city_label')}</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              style={[s.input, { borderColor: '#292524' }]}
              placeholder={t('prem_reg_profile_city_placeholder')}
              placeholderTextColor="#5A6068"
              maxLength={48}
              testID="prem-reg-profile-city"
            />
          </View>

          <Pressable
            onPress={() => enterApp(true)}
            disabled={loading || !validName}
            testID="prem-reg-profile-finish"
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: accent.main },
              pressed && { opacity: 0.85 },
              (loading || !validName) && { opacity: 0.45 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>{t('prem_reg_profile_finish')}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => enterApp(false)}
            disabled={loading}
            testID="prem-reg-profile-skip"
            style={s.skipBtn}
          >
            <Text style={s.skipText}>{t('prem_reg_profile_skip')}</Text>
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
    justifyContent: 'flex-end',
    marginTop: 4,
    marginBottom: 24,
  },
  roleBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },

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

  fieldBlock: { marginBottom: 16 },
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
    fontSize: 16,
    fontWeight: '600',
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
    marginTop: 12,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  skipBtn: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
  },
  skipText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
});
