import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';
import AppShell from '../components/ui/AppShell';
import { colors, radius, spacing, typography } from '../theme/theme';

const HERO = require('../../assets/hero.jpg');
const LOGO = require('../../assets/logo.jpg');

const ROLES = [
  { key: 'driver', icon: 'D', color: colors.green, bg: colors.greenMuted, title: 'Я водитель', desc: 'Найти груз и не ехать порожняком' },
  { key: 'client', icon: 'G', color: colors.orange, bg: colors.orangeMuted, title: 'Я грузовладелец', desc: 'Найти машину и получить ставки' },
];

const FEATURES = [
  { label: 'Проверенные перевозчики' },
  { label: 'Сделки и статусы' },
  { label: 'Чат с переводом' },
  { label: 'Международные маршруты' },
];

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
      if (!data?.token) { setError(t('server_unavailable')); setLoading(null); return; }
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
      if (!data?.token) { setError(t('server_unavailable')); setLoading(null); return; }
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role: 'client' } }] });
    } catch (e) {
      setError(t('connection_failed'));
      setLoading(null);
    }
  };

  const onPress = (key) => key === 'browse' ? quickPreview() : enterAs(key);

  return (
    <AppShell>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero — compact background strip */}
        <View style={s.heroWrap}>
          <Image source={HERO} style={s.heroImg} resizeMode="cover" />
          <View style={s.heroGradient} />
        </View>

        {/* Brand */}
        <View style={s.brand}>
          <Image source={LOGO} style={s.logo} />
          <View>
            <Text style={s.brandName}>UrTruck</Text>
            <Text style={s.brandSub}>INTERNATIONAL LOGISTICS</Text>
          </View>
        </View>

        {/* Headline */}
        <Text style={s.headline}>Международная логистика без лишних посредников</Text>
        <Text style={s.subline}>Грузы, машины, ставки, сделки и чат с переводом — в одном приложении.</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Role cards */}
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.key}
            style={s.roleCard}
            onPress={() => onPress(r.key)}
            disabled={!!loading}
            activeOpacity={0.8}
          >
            <View style={[s.roleIcon, { backgroundColor: r.bg }]}>
              {loading === r.key ? (
                <ActivityIndicator color={r.color} size="small" />
              ) : (
                <Text style={[s.roleIconText, { color: r.color }]}>{r.icon}</Text>
              )}
            </View>
            <View style={s.roleInfo}>
              <Text style={s.roleTitle}>{r.title}</Text>
              <Text style={s.roleDesc}>{r.desc}</Text>
            </View>
            <Text style={s.arrow}>&#8250;</Text>
          </TouchableOpacity>
        ))}

        {/* Features */}
        <View style={s.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureItem}>
              <View style={s.featureDot} />
              <Text style={s.featureText}>{f.label}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </AppShell>
  );
}

const s = StyleSheet.create({
  scroll: { paddingBottom: 40 },

  // Hero
  heroWrap: { height: 120, overflow: 'hidden' },
  heroImg: { width: '100%', height: '100%' },
  heroGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,11,18,0.65)' },

  // Brand
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.xl, marginTop: -20 },
  logo: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
  brandName: { ...typography.h1, color: colors.text },
  brandSub: { ...typography.small, color: colors.textDim, letterSpacing: 2, marginTop: 1 },

  // Headlines
  headline: { ...typography.h2, color: colors.text, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  subline: { ...typography.body, color: colors.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xs, marginBottom: spacing.lg },

  error: { ...typography.caption, color: colors.red, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },

  // Role cards
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md,
  },
  roleIcon: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  roleIconText: { ...typography.h2, fontWeight: '800' },
  roleInfo: { flex: 1 },
  roleTitle: { ...typography.title, color: colors.text },
  roleDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  arrow: { color: colors.textDim, fontSize: 22, fontWeight: '300' },

  // Features
  features: {
    marginTop: spacing.xl, marginHorizontal: spacing.xl,
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  featureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  featureText: { ...typography.caption, color: colors.textMuted },
});
