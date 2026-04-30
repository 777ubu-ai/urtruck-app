import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, Platform, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { setLanguage, getLanguage } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { getProfile, saveProfile } from '../utils/store';
import { storage } from '../utils/storage';
import GradientText from '../components/GradientText';
import { API_BASE } from '../config/env';

const LANGS = [
  { code: 'RU', flag: '🇷🇺', name: 'Русский' },
  { code: 'CN', flag: '🇨🇳', name: '中文' },
  { code: 'EN', flag: '🇬🇧', name: 'English' },
  { code: 'KZ', flag: '🇰🇿', name: 'Қазақша' },
];

const confirm = (title, msg, onOk) => {
  if (Platform.OS === 'web') {
    if (window.confirm(title + (msg ? '\n\n' + msg : ''))) onOk();
  } else {
    Alert.alert(title, msg, [{ text: '✕', style: 'cancel' }, { text: 'OK', onPress: onOk }]);
  }
};

export default function ProfileScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#2563EB' : '#F59E0B';
  const { isDark, toggleTheme, theme } = useTheme();
  const { t } = useI18n();
  const { session, signOut, setRole } = useAuth();
  const [profile, setProfile] = useState(getProfile(session?.user?.id) || {});
  const [lang, setLang] = useState(getLanguage());

  // HOT-001: Подтягиваем имя/город с сервера при КАЖДОМ открытии (focus).
  // Так изменения из EditProfile сразу видны после goBack().
  const fetchProfile = useCallback(async () => {
    try {
      const token = await storage.get('ur_reg_token');
      if (!token) return;
      const r = await fetch(`${API_BASE}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        setProfile(prev => {
          const updated = {
            ...(prev || {}),
            display_name: d.name || prev?.display_name,
            full_name: d.name || prev?.full_name,
            city: d.city ?? prev?.city,
            bio: d.about ?? prev?.bio,
          };
          if (session?.user?.id) saveProfile(session.user.id, updated);
          return updated;
        });
      }
    } catch {}
  }, [session?.user?.id]);

  useFocusEffect(useCallback(() => {
    fetchProfile();
  }, [fetchProfile]));

  // HOT2-007: "Мои рейсы/грузы" — первый выделенный пункт
  const primary = {
    icon: isDriver ? '🚛' : '📦',
    label: isDriver ? t('menu_my_trips') : t('menu_my_cargos'),
    sub: isDriver ? t('menu_my_trips_sub') : t('menu_my_cargos_sub'),
    screen: 'MyTripsList',
    featured: true,
  };
  const menuItems = [
    { icon: '💬', label: t('chatsSection'), value: '→', screen: 'ChatsList' },
    { icon: '⭐', label: t('myReviews'), value: '→', screen: 'Reviews' },
    { icon: '✏️', label: t('editProfile') || 'Редактировать профиль', value: '→', screen: 'EditProfile' },
  ];

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <GradientText style={s.title} colors={isDriver ? ['#2563EB', '#22C55E'] : ['#F59E0B', '#EF4444']}>{t('profile')}</GradientText>

        <View style={[s.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity style={s.editBtn} onPress={() => navigation.navigate('EditProfile', { role })}>
            <Text style={{ fontSize: 14 }}>✏️</Text>
          </TouchableOpacity>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[s.avatar, { borderColor: accent + '40' }]} />
          ) : (
            <View style={[s.avatar, { backgroundColor: accent + '20', borderColor: accent + '30' }]}>
              <Text style={{ fontSize: 30 }}>{isDriver ? '🚛' : '📦'}</Text>
            </View>
          )}
          <Text style={[s.name, { color: theme.text }]}>
            {profile.display_name || profile.full_name || t('add_name')}
          </Text>
          <Text style={[s.phone, { color: theme.textMuted }]}>
            {session?.user?.phone || ''} · {isDriver ? t('role_driver') : t('role_shipper')}
          </Text>
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>
            {isDriver
              ? `${t(profile.truckType || 'tent')} · ${profile.plate_truck || ''} · ${profile.capacity_tons || '—'}t`
              : `${t(profile.company_type || 'importer')}${profile.city ? ' · ' + profile.city : ''}`}
          </Text>
          <View style={[s.verifiedBadge, { backgroundColor: profile.is_verified ? '#22C55E15' : '#F59E0B15' }]}>
            <Text style={[s.verifiedText, { color: profile.is_verified ? '#22C55E' : '#F59E0B' }]}>
              {profile.is_verified ? '🟢 ' + t('verified') : '🟡 ' + t('pending')}
            </Text>
          </View>
          {isDriver && <Text style={s.ratingText}>★ {profile.rating || 5.0} · {profile.reviews_count || 0}</Text>}
        </View>

        {/* HOT2-007: Основная кнопка — Мои рейсы / Мои грузы */}
        <TouchableOpacity
          style={[s.primaryMenu, { borderColor: accent }]}
          onPress={() => navigation.navigate(primary.screen, { role, initialTab: 'my' })}
          activeOpacity={0.85}
        >
          <View style={[s.primaryMenuBg, { backgroundColor: accent }]} />
          <Text style={s.primaryMenuIcon}>{primary.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.primaryMenuLabel}>{primary.label}</Text>
            <Text style={s.primaryMenuSub}>{primary.sub}</Text>
          </View>
          <Text style={s.primaryMenuArrow}>→</Text>
        </TouchableOpacity>

        {menuItems.map(item => (
          <TouchableOpacity
            key={item.label}
            style={[s.menuItem, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => item.screen && navigation.navigate(item.screen, { role })}
          >
            <Text style={s.menuIcon}>{item.icon}</Text>
            <Text style={[s.menuLabel, { color: theme.text }]}>{item.label}</Text>
            <Text style={[s.menuValue, { color: theme.textSecondary }]}>{item.value}</Text>
          </TouchableOpacity>
        ))}

        <View style={[s.settingsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[s.settingLabel, { color: theme.text }]}>Тема</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: isDark ? 'transparent' : accent }}
                onPress={() => toggleTheme()}
              >
                <Text style={{ color: isDark ? theme.textMuted : '#fff', fontSize: 12, fontWeight: '700' }}>☀️ Светлая</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: isDark ? accent : 'transparent' }}
                onPress={() => { if (!isDark) toggleTheme(); }}
              >
                <Text style={{ color: isDark ? '#fff' : theme.textMuted, fontSize: 12, fontWeight: '700' }}>🌙 Тёмная</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ marginTop: 0 }}>
            <Text style={[s.settingLabel, { color: theme.text, marginBottom: 10 }]}>🌐 {t('language')}</Text>
            <View style={s.langGrid}>
              {LANGS.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[s.langCard, { backgroundColor: theme.bg, borderColor: theme.border }, lang === l.code && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => { setLang(l.code); setLanguage(l.code); }}
                >
                  <Text style={{ fontSize: 24 }}>{l.flag}</Text>
                  <Text style={[s.langCardText, { color: theme.textSecondary }, lang === l.code && { color: isDriver ? '#fff' : '#0C0A09' }]}>{l.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.pushBtn, { backgroundColor: theme.bg, borderColor: theme.border }]}
            onPress={() => navigation.navigate('PushFilter', { role })}
          >
            <Text style={[s.settingLabel, { color: theme.text }]}>🔔 {t('pushFilter')}</Text>
            <Text style={[s.configureBtn, { color: accent }]}>{t('configure')} →</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.updateBtn, { borderColor: '#4F46E5' }]}
          onPress={async () => {
            try {
              if (typeof caches !== 'undefined') {
                const ks = await caches.keys();
                await Promise.all(ks.map(k => caches.delete(k)));
              }
              if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
              }
              if (typeof window !== 'undefined') window.location.reload(true);
            } catch {}
          }}
        >
          <Text style={s.updateBtnText}>🔄 Обновить приложение</Text>
          <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>v1.0.50 · 17.04.2026</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.changeRoleBtn}
          onPress={() => confirm(t('changeRole'), '?', () => setRole(null))}
        >
          <Text style={s.changeRoleText}>{t('changeRole')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => confirm(t('logout'), '?', () => signOut())}
        >
          <Text style={s.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900', marginBottom: 14 },
  profileCard: { borderRadius: 18, padding: 24, borderWidth: 1, alignItems: 'center', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 3, marginBottom: 10 },
  editBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: '#F59E0B20', borderWidth: 1, borderColor: '#F59E0B40', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  name: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  phone: { fontSize: 12, marginBottom: 3 },
  subtitle: { fontSize: 12 },
  verifiedBadge: { marginTop: 8, backgroundColor: '#22C55E15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  verifiedText: { color: '#22C55E', fontSize: 12, fontWeight: '600' },
  ratingText: { color: '#FBBF24', fontSize: 13, fontWeight: '700', marginTop: 6 },
  menuItem: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon: { fontSize: 18 },
  menuLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  menuValue: { fontSize: 12 },
  // HOT2-007: Featured primary menu row
  primaryMenu: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, padding: 18, borderWidth: 2, marginBottom: 14,
    overflow: 'hidden', position: 'relative',
  },
  primaryMenuBg: {
    ...StyleSheet.absoluteFillObject, opacity: 0.16,
  },
  primaryMenuIcon: { fontSize: 28 },
  primaryMenuLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  primaryMenuSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  primaryMenuArrow: { color: '#fff', fontSize: 20, fontWeight: '800' },
  settingsCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginTop: 8, marginBottom: 12 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { fontSize: 13, fontWeight: '600' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langCard: {
    width: '22.5%', minWidth: 70,
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center', gap: 4,
  },
  langCardText: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  pushBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 14 },
  configureBtn: { fontSize: 12, fontWeight: '700' },
  updateBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, marginBottom: 10 },
  updateBtnText: { color: '#4F46E5', fontSize: 14, fontWeight: '700' },
  changeRoleBtn: { backgroundColor: '#EF444415', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EF444425' },
  changeRoleText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  logoutBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#57534E', fontSize: 13 },
});
