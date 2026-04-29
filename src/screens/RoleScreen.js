import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';

const LOGO = require('../../assets/logo.jpg');
const HERO = require('../../assets/hero.jpg');

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole, ensureGuest, hasToken } = useAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const enterAs = async (role) => {
    setLoading(role);
    setError('');
    try {
      const data = await regAPI.ensureGuest();
      if (!data?.token) {
        setError(t('server_unavailable'));
        setLoading(null);
        return;
      }
      await signIn('test-user', 1, data.token);
      setRole(role);
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
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroWrap}>
          <Image source={HERO} style={s.heroImg} resizeMode="cover" />
          <View style={s.heroOverlay} />
        </View>

        {/* Logo */}
        <View style={s.logoRow}>
          <Image source={LOGO} style={s.logoImg} />
          <View>
            <Text style={s.logoTitle}>UrTruck</Text>
            <Text style={s.logoSub}>INTERNATIONAL LOGISTICS</Text>
          </View>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Roles */}
        <TouchableOpacity style={s.roleBtn} onPress={() => enterAs('driver')} disabled={!!loading} activeOpacity={0.85}>
          <View style={[s.roleIcon, { backgroundColor: '#2563EB' }]}>
            {loading === 'driver' ? <ActivityIndicator color="#fff" /> : <Text style={s.roleEmoji}>🚛</Text>}
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('driver')}</Text>
            <Text style={s.roleDesc}>{t('driverDesc')}</Text>
          </View>
          <Text style={s.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.roleBtn} onPress={() => enterAs('client')} disabled={!!loading} activeOpacity={0.85}>
          <View style={[s.roleIcon, { backgroundColor: '#F59E0B' }]}>
            {loading === 'client' ? <ActivityIndicator color="#fff" /> : <Text style={s.roleEmoji}>📦</Text>}
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('client')}</Text>
            <Text style={s.roleDesc}>{t('clientDesc')}</Text>
          </View>
          <Text style={s.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.roleBtn, { borderColor: 'rgba(255,255,255,0.06)' }]} onPress={quickPreview} disabled={!!loading} activeOpacity={0.85}>
          <View style={[s.roleIcon, { backgroundColor: '#22C55E' }]}>
            {loading === 'browse' ? <ActivityIndicator color="#fff" /> : <Text style={s.roleEmoji}>👀</Text>}
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('quick_preview')}</Text>
            <Text style={s.roleDesc}>{t('quick_preview_sub')}</Text>
          </View>
          <Text style={s.arrow}>→</Text>
        </TouchableOpacity>

        {/* Trust */}
        <View style={s.trust}>
          <View style={s.flags}>
            {['🇰🇿','🇷🇺','🇺🇿','🇨🇳','🇰🇬'].map((f, i) => <View key={i} style={s.flagCircle}><Text style={{ fontSize: 14 }}>{f}</Text></View>)}
          </View>
          <Text style={s.trustText}>500+ проверенных перевозчиков</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0f1a' },
  scroll: { paddingHorizontal: 16, paddingBottom: 30 },

  heroWrap: { width: '100%', height: 180, borderRadius: 20, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  heroImg: { width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  logoImg: { width: 48, height: 48, borderRadius: 12 },
  logoTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  logoSub: { fontSize: 9, color: '#64748b', letterSpacing: 2, marginTop: 2 },

  error: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginBottom: 12 },

  roleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  roleIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleEmoji: { fontSize: 22 },
  roleInfo: { flex: 1 },
  roleName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  roleDesc: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  arrow: { color: 'rgba(255,255,255,0.3)', fontSize: 18, fontWeight: '700' },

  trust: { alignItems: 'center', marginTop: 20 },
  flags: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  flagCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  trustText: { fontSize: 12, color: '#64748b' },
});
