import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { t } from '../utils/i18n';
import { regAPI } from '../utils/registration';

const DARK = {
  bg: '#0a0f1a',
  card: 'rgba(255,255,255,0.05)',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.6)',
  accentBlue: '#378ADD',
  accentYellow: '#F59E0B',
  accentGreen: '#4CAF50',
};

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole, ensureGuest, hasToken } = useAuth();
  const [loading, setLoading] = useState(null);

  const [error, setError] = useState('');

  const enterAs = async (role) => {
    setLoading(role);
    setError('');
    try {
      // 1. Получаем серверный токен
      const data = await regAPI.ensureGuest();
      if (!data?.token) {
        setError('Сервер недоступен. Проверьте интернет.');
        setLoading(null);
        return;
      }
      // 2. signIn с токеном — невозможно войти без него
      await signIn('test-user', 1, data.token);
      setRole(role);
      // 3. Main
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch (e) {
      setError(t('connection_failed'));
      setLoading(null);
    }
  };

  const quickPreview = async () => {
    setLoading('browse');
    setError('');
    try {
      const data = await regAPI.ensureGuest();
      if (!data?.token) {
        setError(t('server_unavailable'));
        setLoading(null);
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role: 'client' } }] });
    } catch (e) {
      setError(t('connection_failed'));
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.logoWrap}>
        <View style={s.logo}><Text style={{ fontSize: 28 }}>🚛</Text></View>
        <Text style={s.logoText}>UrTruck</Text>
        <Text style={s.betaTag}>ТЕСТОВЫЙ РЕЖИМ</Text>
      </View>

      <View style={s.content}>
        <Text style={s.heading}>{t('whoAreYou')}</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[s.roleBtn, { borderColor: `${DARK.accentBlue}80` }]}
          onPress={() => enterAs('driver')}
          disabled={!!loading}
          activeOpacity={0.85}
        >
          <View style={[s.roleIcon, { backgroundColor: DARK.accentBlue }]}>
            {loading === 'driver' ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 26 }}>🚛</Text>}
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>Я перевозчик</Text>
            <Text style={s.roleDesc}>Найти груз · Не ехать порожняком</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.roleBtn, { borderColor: `${DARK.accentYellow}80` }]}
          onPress={() => enterAs('client')}
          disabled={!!loading}
          activeOpacity={0.85}
        >
          <View style={[s.roleIcon, { backgroundColor: DARK.accentYellow }]}>
            {loading === 'client' ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 26 }}>📦</Text>}
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>Я грузоотправитель</Text>
            <Text style={s.roleDesc}>Найти машину · Без посредников</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.roleBtn, { borderColor: `${DARK.accentGreen}80` }]}
          onPress={quickPreview}
          disabled={!!loading}
          activeOpacity={0.85}
        >
          <View style={[s.roleIcon, { backgroundColor: DARK.accentGreen }]}>
            {loading === 'browse' ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 26 }}>👀</Text>}
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('quick_preview')}</Text>
            <Text style={s.roleDesc}>{t('quick_preview_sub')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: DARK.bg },
  logoWrap: { alignItems: 'center', paddingTop: 40, marginBottom: 30 },
  logo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: DARK.accentBlue, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: { fontSize: 26, fontWeight: '900', color: DARK.text, letterSpacing: -0.5 },
  betaTag: { color: '#22c55e', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 8 },
  error: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  content: { flex: 1, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '800', marginBottom: 22, color: DARK.text },
  roleBtn: {
    borderWidth: 1, borderRadius: 18,
    padding: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DARK.card,
  },
  roleIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  roleInfo: { flex: 1 },
  roleName: { fontSize: 17, fontWeight: '800', color: DARK.text },
  roleDesc: { fontSize: 12, marginTop: 3, color: DARK.textMuted },
});
