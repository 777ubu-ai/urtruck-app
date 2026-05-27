import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { setLanguage, getLanguage } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import { useAuth } from '../utils/AuthContext';
import { getProfile, saveProfile } from '../utils/store';
import { storage } from '../utils/storage';
import GradientText from '../components/GradientText';
import { API_BASE } from '../config/env';

const LANGS = [
  { code: 'RU', flag: '🇷🇺', name: 'Русский' },
  { code: 'EN', flag: '🇬🇧', name: 'English' },
  { code: 'KK', flag: '🇰🇿', name: 'Қазақша' },
  { code: 'ZH', flag: '🇨🇳', name: '中文' },
];

// Stage 26: confirm() теперь принимает локализованные кнопки и
// нормальный message (раньше message был жёстко "?", а cancel был
// "✕"). Все три параметра title/msg/labels должны проходить через
// i18n, помойте, без литералов.
const confirm = (title, msg, onOk, cancelLabel = 'Отмена', confirmLabel = 'OK') => {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.confirm) { onOk(); return; }
    if (window.confirm(title + (msg ? '\n\n' + msg : ''))) onOk();
  } else {
    Alert.alert(title, msg || '', [
      { text: cancelLabel, style: 'cancel' },
      { text: confirmLabel, onPress: onOk },
    ]);
  }
};

export default function ProfileScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#22C55E' : '#F59E0B';
  const { isDark, toggleTheme } = useTheme();
  // Stage 8: read tokens from the v1 hook so the screen lines up
  // with the rest of the app. The v1 palette doesn't expose a
  // separate secondary tier, so we map `textSecondary` onto
  // `textMuted` and `card` onto `surface` for the existing inline
  // styles below. Cloned so we don't mutate the shared frozen-style
  // object the hook returns.
  const v1 = useV1Colors();
  const theme = {
    ...v1,
    card: v1.surface,
    textSecondary: v1.textMuted,
  };
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
          // N2: используем `||` вместо `??`, чтобы пустая строка с
          // сервера НЕ перезатирала локальное значение. У `??` пустая
          // строка считается валидным значением и затирает поле.
          const updated = {
            ...(prev || {}),
            display_name: d.name || prev?.display_name,
            full_name: d.name || prev?.full_name,
            city: d.city || prev?.city,
            bio: d.about || prev?.bio,
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

  // PR-C2 (WeChat redesign): grouped list — 4 items в одной карточке
  // с тонкими separators между ними. Иконки — Feather outline (унифицированный
  // muted gray), вместо разноцветных emoji. Это premium WeChat-style вид.
  const menuItems = [
    { icon: 'truck',         label: t('profile_cargoruqsat_title'), sub: t('profile_cargoruqsat_subtitle'), screen: 'CargoRuqsatInfo' },
    { icon: 'message-circle',label: t('chatsSection'),  screen: 'ChatsList' },
    { icon: 'star',          label: t('myReviews'),     screen: 'Reviews' },
    { icon: 'edit-2',        label: t('editProfile'),   screen: 'EditProfile' },
  ];

  // PR-C2 (driver card): canonical specs line «Тент · 20 т · 86 м³».
  // Раньше строка собиралась как `${truckType} · ${plate_truck} · ${capacity}t`
  // — это (1) показывало номер тягача в публичном виде, (2) использовало
  // латинскую `t` без пробела, (3) пропускало volume_m3 полностью.
  // Spec from image_31.png: «Тент · 20 т · 86 м³».
  const specsLine = isDriver
    ? [
        t(profile.truckType || 'tent'),
        profile.capacity_tons != null && profile.capacity_tons !== '' ? `${profile.capacity_tons} т` : null,
        profile.available_m3 != null && profile.available_m3 !== '' ? `${profile.available_m3} м³` : null,
      ].filter(Boolean).join(' · ')
    : [
        t(profile.company_type || 'importer'),
        profile.city,
      ].filter(Boolean).join(' · ');

  const phoneRoleLine = `${session?.user?.phone || ''} · ${isDriver ? t('role_driver') : t('role_shipper')}`;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <GradientText style={s.title} colors={isDriver ? ['#22C55E', '#22C55E'] : ['#F59E0B', '#EF4444']}>{t('profile')}</GradientText>

        {/* PR-C2 (WeChat horizontal card): avatar слева, текст справа стеком.
            Compact 80px высоты вместо 200px вертикальной. */}
        <View style={[s.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[s.avatar, { borderColor: accent + '40' }]} />
          ) : (
            <View style={[s.avatar, { backgroundColor: accent + '20', borderColor: accent + '30' }]}>
              <Text style={{ fontSize: 24 }}>{isDriver ? '🚛' : '📦'}</Text>
            </View>
          )}
          <View style={s.profileInfo}>
            {/* Row 1: имя + subtle verified checkmark если verified */}
            <View style={s.profileNameRow}>
              <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
                {profile.display_name || profile.full_name || t('add_name')}
              </Text>
              {profile.is_verified ? (
                <View style={[s.verifiedDot, { backgroundColor: '#22C55E' }]}>
                  <Feather name="check" size={10} color="#fff" />
                </View>
              ) : null}
            </View>
            {/* Row 2: phone + role + rating справа */}
            <View style={s.profileMetaRow}>
              <Text style={[s.phone, { color: theme.textMuted }]} numberOfLines={1}>
                {phoneRoleLine}
              </Text>
              {isDriver && (profile.rating || profile.rating === 0) ? (
                <Text style={[s.ratingInline, { color: '#FBBF24' }]}>
                  {'  '}★ {profile.rating || 5.0}
                </Text>
              ) : null}
            </View>
            {/* Row 3: specs — Тент · 20 т · 86 м³ */}
            {specsLine ? (
              <Text style={[s.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {specsLine}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity style={s.editBtnInline} onPress={() => navigation.navigate('EditProfile', { role })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="edit-2" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* PR-C2 (WeChat grouped list): 4 menu items в одной карточке
            с тонкими separators. Без emoji — Feather outline icons. */}
        <View style={[s.menuGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              {idx > 0 ? <View style={[s.menuSeparator, { backgroundColor: theme.border }]} /> : null}
              <TouchableOpacity
                style={s.menuRow}
                onPress={() => item.screen && navigation.navigate(item.screen, { role })}
                activeOpacity={0.6}
              >
                <View style={[s.menuIconWrap, { backgroundColor: theme.bg }]}>
                  <Feather name={item.icon} size={18} color={theme.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.menuLabel, { color: theme.text }]}>{item.label}</Text>
                  {item.sub ? <Text style={[s.menuSub, { color: theme.textMuted }]}>{item.sub}</Text> : null}
                </View>
                <Feather name="chevron-right" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* PR-C2 (compact settings): уменьшен padding 16→12, gap между
            theme и language секциями — 12 вместо 14, gap между flags — 6.
            Логика Light/Dark + 4 языка сохранена полностью. */}
        <View style={[s.settingsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.settingsRow}>
            <Text style={[s.settingLabel, { color: theme.text }]}>{t('theme_label')}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[s.themeBtn, { backgroundColor: isDark ? 'transparent' : accent, borderColor: isDark ? theme.border : accent }]}
                onPress={() => { if (isDark) toggleTheme(); }}
              >
                <Text style={[s.themeBtnText, { color: isDark ? theme.textMuted : '#fff' }]}>☀️ {t('theme_light')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.themeBtn, { backgroundColor: isDark ? accent : 'transparent', borderColor: isDark ? accent : theme.border }]}
                onPress={() => { if (!isDark) toggleTheme(); }}
              >
                <Text style={[s.themeBtnText, { color: isDark ? '#fff' : theme.textMuted }]}>🌙 {t('theme_dark')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.settingsRow, { marginTop: 12, flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[s.settingLabel, { color: theme.text, marginBottom: 8 }]}>🌐 {t('language')}</Text>
            <View style={s.langGrid}>
              {LANGS.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[s.langCard, { backgroundColor: theme.bg, borderColor: theme.border }, lang === l.code && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => { setLang(l.code); setLanguage(l.code); }}
                >
                  <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                  <Text style={[s.langCardText, { color: theme.textSecondary }, lang === l.code && { color: isDriver ? '#fff' : '#0C0A09' }]} numberOfLines={1}>
                    {l.name}
                  </Text>
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
          <Text style={s.updateBtnText}>🔄 {t('profile_update_app')}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>v1.0.50 · 17.04.2026</Text>
        </TouchableOpacity>

        {/* RC2 hotfix (P1-1): "Сменить роль" скрыт из production UX —
            фича смены роли налету ещё не покрыта профилем (см. PLAN
            RC2-D: смена роли требует переустановки role-specific полей
            типа труков для драйвера). В debug-режиме оставлено для QA.
            Когда фича доделается — снимем условие. */}
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <TouchableOpacity
            style={s.changeRoleBtn}
            onPress={() => confirm(
              t('change_role_title'),
              t('change_role_message'),
              () => setRole(null),
              t('cancel') || 'Отмена',
              t('change_role_confirm'),
            )}
            testID="profile-change-role"
          >
            <Text style={s.changeRoleText}>{t('changeRole')}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => confirm(
            t('logout_title') || t('logout'),
            t('logout_message'),
            async () => {
              // RC2 hotfix (P1-2): await signOut (теперь async) →
              // навигация reset как safety net. AppNavigator должен
              // реактивно перерисоваться от hasToken=false, но
              // explicit reset гарантирует переход на onboarding
              // даже если listener'ы гонятся.
              try { await signOut(); } catch {}
              try {
                navigation.reset({ index: 0, routes: [{ name: 'OnboardingV2' }] });
              } catch (e) {
                // OnboardingV2 может быть не в стеке (qaPreview / legacy);
                // fallback на корневой Stack — пусть AppNavigator решит.
                try { navigation.popToTop(); } catch {}
              }
            },
            t('cancel') || 'Отмена',
            t('logout_confirm') || t('logout'),
          )}
          testID="profile-logout"
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

  // PR-C2 (WeChat horizontal card)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    marginBottom: 14,
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  profileInfo: { flex: 1, gap: 3 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 17, fontWeight: '800', flexShrink: 1 },
  verifiedDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  phone: { fontSize: 12, flexShrink: 1 },
  ratingInline: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  subtitle: { fontSize: 12 },
  editBtnInline: { position: 'absolute', top: 10, right: 10, padding: 4 },

  // PR-C2 (WeChat grouped list)
  menuGroup: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
  menuIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '600' },
  menuSub: { fontSize: 11, marginTop: 1 },

  // PR-C2 (compact settings)
  settingsCard: { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 12 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { fontSize: 13, fontWeight: '600' },
  themeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  themeBtnText: { fontSize: 12, fontWeight: '700' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  langCard: {
    width: '23.5%', minWidth: 68,
    paddingVertical: 8, paddingHorizontal: 4,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center', gap: 3,
  },
  langCardText: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  pushBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  configureBtn: { fontSize: 12, fontWeight: '700' },

  updateBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, marginBottom: 10 },
  updateBtnText: { color: '#4F46E5', fontSize: 14, fontWeight: '700' },
  changeRoleBtn: { backgroundColor: '#EF444415', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EF444425' },
  changeRoleText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  logoutBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#57534E', fontSize: 13 },
});
