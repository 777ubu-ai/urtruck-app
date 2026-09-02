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
import { regAPI } from '../utils/registration';
import { driverTier, countCompletedTrips, isDocsConfirmed } from '../utils/security';
import { marketAPI } from '../utils/marketAPI';
import GradientText from '../components/GradientText';
import HelpButton from '../components/HelpButton';
import { API_BASE } from '../config/env';
import { IS_BETA } from '../config/supabase';
import AppConfirmModal from '../components/ui/AppConfirmModal';
import { localizePlace } from '../utils/places';

const LANGS = [
  { code: 'RU', flag: '🇷🇺' },
  { code: 'EN', flag: '🇬🇧' },
  { code: 'KK', flag: '🇰🇿' },
  { code: 'ZH', flag: '🇨🇳' },
];

const QA_HOOK_ALLOWED = (() => {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  try {
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership !== 'standalone';
  } catch {
    return false;
  }
})();

const APP_VERSION_LABEL = (() => {
  try {
    const Constants = require('expo-constants').default;
    let Application = null;
    try {
      Application = require('expo-application');
    } catch {}
    const ver = Application?.nativeApplicationVersion
      || Constants?.nativeAppVersion
      || Constants?.expoConfig?.version
      || '1.0.4';
    const build = Application?.nativeBuildVersion
      || Constants?.nativeBuildVersion
      || (Platform.OS === 'ios' ? Constants?.expoConfig?.ios?.buildNumber : '')
      || '';
    const commit = process.env.EXPO_PUBLIC_BUILD_COMMIT;
    return `v${ver}${build ? ` (${build})` : ''}${commit ? ` · Build: ${commit}` : ''}`;
  } catch {
    return 'v1.0.4';
  }
})();

export default function ProfileScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#168759' : '#FF8400';
  const onAccent = '#0C0A09';
  const { isDark, themeMode, setThemeMode } = useTheme();
  const v1 = useV1Colors();
  const theme = {
    ...v1,
    card: v1.surface,
    textSecondary: v1.textMuted,
  };
  const { t, lang: uiLang } = useI18n();
  const tonUnit = uiLang === 'ZH' ? '吨' : uiLang === 'EN' ? 't' : 'т';
  const cubicMeterUnit = uiLang === 'ZH' ? '立方米' : 'м³';
  const { session, signOut, verificationLevel } = useAuth();
  const [profile, setProfile] = useState(getProfile(session?.user?.id) || {});
  const [lang, setLang] = useState(getLanguage());
  const [confirmDialog, setConfirmDialog] = useState(null);
  const askConfirm = useCallback((title, message = '', confirmLabel = t('confirm')) => new Promise((resolve) => {
    setConfirmDialog({ title, message, confirmLabel, resolve });
  }), [t]);
  const settleConfirm = useCallback((answer) => {
    const resolve = confirmDialog?.resolve;
    setConfirmDialog(null);
    resolve?.(answer);
  }, [confirmDialog]);

  const fetchProfile = useCallback(async () => {
    try {
      const token = await storage.get('ur_reg_token');
      if (!token) return;
      const r = await fetch(`${API_BASE}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      let st = null;
      try { st = await regAPI.status(); } catch {}
      let completedTrips = 0;
      try { const dash = await marketAPI.myDashboard(); completedTrips = countCompletedTrips(dash?.my_deals); } catch {}
      if (r.ok) {
        const d = await r.json();
        setProfile(prev => {
          const updated = {
            ...(prev || {}),
            display_name: d.name || prev?.display_name,
            full_name: d.name || prev?.full_name,
            city: d.city || st?.city || prev?.city,
            bio: d.about || prev?.bio,
            ...(st?.vehicle_type ? { truckType: st.vehicle_type } : {}),
            ...(st?.capacity_tons != null ? { capacity_tons: st.capacity_tons } : {}),
            ...(st?.volume_m3 != null ? { available_m3: st.volume_m3 } : {}),
            ...(st?.security_score != null ? { driver_score: st.security_score } : {}),
            ...(st?.status ? { reg_status: st.status } : {}),
            ...(st?.verification_level != null ? { verification_level: st.verification_level } : {}),
            ...(st?.rating != null ? { rating: Number(st.rating) } : {}),
            doc_confirmed: isDocsConfirmed(st),
            completed_trips: completedTrips,
            is_verified: isDocsConfirmed(st) || prev?.is_verified || false,
            ...(d.legal_form ? { legal_form: d.legal_form } : {}),
            ...(d.china_experience_years != null ? { china_experience_years: d.china_experience_years } : {}),
            ...(Array.isArray(d.favorite_borders) && d.favorite_borders.length ? { favorite_borders: d.favorite_borders } : {}),
            ...(d.emergency_contact ? { emergency_contact: d.emergency_contact } : {}),
            ...(d.passport_intl_url ? { passport_intl_url: d.passport_intl_url } : {}),
            ...(d.tir_book_url ? { tir_book_url: d.tir_book_url } : {}),
            ...(d.cmr_insurance_url ? { cmr_insurance_url: d.cmr_insurance_url } : {}),
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
  // Notifications are not a second navigation hub anymore. Deal events and
  // their unread state live in the dedicated Deals area, so Profile must not
  // duplicate the same feed or badge.
  const menuItems = [
    ...(isDriver ? [{ icon: 'shield', label: t('security_my_status'), sub: t('my_status_subtitle'), screen: 'Security', testID: 'profile-my-status' }] : []),
    { icon: 'star', label: t('myReviews'), screen: 'Reviews', testID: 'profile-my-reviews' },
    { icon: 'heart', label: t('favorites_title'), screen: 'Favorites', testID: 'profile-favorites' },
    { icon: 'help-circle', label: t('howit_header'), screen: 'HowItWorks', testID: 'profile-how-it-works' },
    { icon: 'info', label: t('about_title'), screen: 'About', testID: 'profile-about' },
  ];

  const specsLine = isDriver
    ? [
        t(profile.truckType || 'tent'),
        profile.capacity_tons != null && profile.capacity_tons !== '' ? `${profile.capacity_tons} ${tonUnit}` : null,
        profile.available_m3 != null && profile.available_m3 !== '' ? `${profile.available_m3} ${cubicMeterUnit}` : null,
      ].filter(Boolean).join(' · ')
    : [
        profile.company_type ? t(profile.company_type) : null,
        localizePlace(profile.city, uiLang),
      ].filter(Boolean).join(' · ');

  const phoneRoleLine = `${session?.user?.phone || ''} · ${isDriver ? t('role_driver') : t('role_shipper')}`;
  const PRO_FIELDS = ['legal_form', 'china_experience_years', 'favorite_borders', 'emergency_contact'];
  const proFilled = isDriver
    ? PRO_FIELDS.filter(k => {
        const v = profile[k];
        if (v == null || v === '') return false;
        if (Array.isArray(v)) return v.length > 0;
        return true;
      }).length
    : 0;
  const proTotal = PRO_FIELDS.length;
  const proPercent = Math.round((proFilled / proTotal) * 100);
  const proActive = isDriver && proFilled === proTotal;
  const proRemaining = proTotal - proFilled;
  const proStatusTitle = proActive ? t('pro_active_badge') : t('pro_inactive_badge');
  const verificationStatusText = profile.is_verified ? t('verification_passed_short') : t('verification_failed_short');

  const itemsWord = (n) => {
    const lang = getLanguage();
    if (lang !== 'RU') return t('pro_progress_items_many');
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs >= 11 && abs <= 14) return t('pro_progress_items_many');
    if (last === 1) return t('pro_progress_items_one');
    if (last >= 2 && last <= 4) return t('pro_progress_items_few');
    return t('pro_progress_items_many');
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            {navigation.canGoBack?.() ? (
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="profile-back" accessibilityLabel={t('back')}>
                <Feather name="arrow-left" size={24} color={theme.text} />
              </TouchableOpacity>
            ) : null}
            <GradientText style={s.title} colors={isDriver ? ['#168759', '#00C766'] : ['#FF8400', '#EF4444']}>{t('profile')}</GradientText>
          </View>
          <HelpButton accent={accent} />
        </View>

        <View style={[s.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[s.avatar, { borderColor: accent + '40' }]} />
          ) : (
            <View style={[s.avatar, { backgroundColor: accent + '20', borderColor: accent + '30' }]}>
              <Feather name={isDriver ? 'truck' : 'package'} size={24} color={accent} />
            </View>
          )}
          <View style={s.profileInfo}>
            <View style={s.profileNameRow}>
              <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{profile.display_name || profile.full_name || t('add_name')}</Text>
              {profile.is_verified ? (
                <View style={[s.verifiedDot, { backgroundColor: '#168759' }]}>
                  <Feather name="check" size={10} color="#fff" />
                </View>
              ) : null}
            </View>
            <View style={s.profileMetaRow}>
              <Text style={[s.phone, { color: theme.textMuted }]} numberOfLines={1}>{phoneRoleLine}</Text>
              {isDriver && (profile.rating || profile.rating === 0) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 6 }}>
                  <Feather name="star" size={12} color="#D97706" />
                  <Text style={[s.ratingInline, { color: '#D97706' }]}>{profile.rating || 5.0}</Text>
                </View>
              ) : null}
            </View>
            {specsLine ? <Text style={[s.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>{specsLine}</Text> : null}
            {isDriver ? (() => {
              const tr = driverTier({ confirmed: profile.doc_confirmed, trips: profile.completed_trips, rating: profile.rating });
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: tr.color }}>{tr.emoji} {t(tr.key)}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>{`  ·  ${tr.pct}/100`}</Text>
                </View>
              );
            })() : null}
          </View>
          <TouchableOpacity style={s.editBtnInline} onPress={() => navigation.navigate('EditProfile', { role })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="edit-2" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {isDriver ? (
          <View style={[s.proCard, { backgroundColor: theme.card, borderColor: proActive ? accent : theme.border }]}>
            <View style={s.proHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="star" size={15} color={theme.text} />
                  <Text style={[s.proTitle, { color: theme.text }]}>{proStatusTitle}</Text>
                </View>
                {proActive ? (
                  IS_BETA ? <Text style={[s.proSub, { color: theme.textMuted }]}>{verificationStatusText} · {t('pro_beta_note')}</Text> : null
                ) : (
                  <Text style={[s.proSub, { color: theme.textMuted }]}>{verificationStatusText} · {t('pro_progress_remaining')} {proRemaining} {itemsWord(proRemaining)}</Text>
                )}
              </View>
              <View style={[s.proStatusBadge, { backgroundColor: proActive ? '#E9F6EF' : theme.bg, borderColor: proActive ? accent : theme.border }]}>
                <Feather name={proActive ? 'check-circle' : 'alert-circle'} size={14} color={proActive ? accent : theme.textMuted} />
                <Text style={[s.proStatusBadgeText, { color: proActive ? accent : theme.textMuted }]}>{proActive ? t('done') : `${proFilled}/${proTotal}`}</Text>
              </View>
            </View>
            <View style={[s.proTrack, { backgroundColor: theme.bg }]}><View style={[s.proFill, { width: `${proPercent}%`, backgroundColor: accent }]} /></View>
            {!proActive ? (
              <TouchableOpacity style={[s.proCta, { backgroundColor: accent }]} onPress={() => {
                if ((verificationLevel || 0) >= 2) navigation.navigate('EditProfile', { role, focus: 'pro' });
                else navigation.navigate('Citizenship');
              }} activeOpacity={0.85} testID="profile-pro-cta" accessibilityLabel={t('pro_become_btn')}>
                <Text style={[s.proCtaText, { color: onAccent }]}>{t('pro_become_btn')}</Text>
                <Feather name="chevron-right" size={18} color={onAccent} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={[s.menuGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              {idx > 0 ? <View style={[s.menuSeparator, { backgroundColor: theme.border }]} /> : null}
              <TouchableOpacity style={s.menuRow} onPress={() => item.screen && navigation.navigate(item.screen, { role, targetId: session?.user?.id })} activeOpacity={0.6} testID={item.testID} accessibilityLabel={item.label}>
                <View style={[s.menuIconWrap, { backgroundColor: theme.bg }]}><Feather name={item.icon} size={18} color={theme.textMuted} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.menuLabel, { color: theme.text }]}>{item.label}</Text>
                  {item.sub ? <Text style={[s.menuSub, { color: theme.textMuted }]}>{item.sub}</Text> : null}
                </View>
                {item.badgeCount > 0 ? (
                  <View style={s.menuUnreadBadge} testID={`${item.testID}-badge`}>
                    <Text style={s.menuUnreadText}>
                      {item.badgeCount > 9 ? '9+' : item.badgeCount}
                    </Text>
                  </View>
                ) : null}
                <Feather name="chevron-right" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        <View style={[s.settingsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[s.settingsRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[s.settingLabel, { color: theme.text, marginBottom: 8 }]}>{t('theme_label')}</Text>
            {/* §5 (reconcile 01.09.2026): явный 3-позиционный выбор
                Light/Dark/System — themeMode — единственный source of
                truth (ThemeContext.js), эти кнопки просто его выставляют.
                Три кнопки (было две) не помещаются в одну строку рядом с
                лейблом на узких экранах (320px) — колонка вместо строки,
                как уже сделано для языкового пикера ниже. */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity testID="theme-toggle-light" accessibilityRole="button" accessibilityState={{ selected: themeMode === 'light' }} accessibilityLabel={t('theme_light')} style={[s.themeBtn, { backgroundColor: themeMode === 'light' ? accent : 'transparent', borderColor: themeMode === 'light' ? accent : theme.border }]} onPress={() => setThemeMode('light')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Feather name="sun" size={13} color={themeMode === 'light' ? onAccent : theme.textMuted} /><Text style={[s.themeBtnText, { color: themeMode === 'light' ? onAccent : theme.textMuted }]}>{t('theme_light')}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity testID="theme-toggle-dark" accessibilityRole="button" accessibilityState={{ selected: themeMode === 'dark' }} accessibilityLabel={t('theme_dark')} style={[s.themeBtn, { backgroundColor: themeMode === 'dark' ? accent : 'transparent', borderColor: themeMode === 'dark' ? accent : theme.border }]} onPress={() => setThemeMode('dark')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Feather name="moon" size={13} color={themeMode === 'dark' ? onAccent : theme.textMuted} /><Text style={[s.themeBtnText, { color: themeMode === 'dark' ? onAccent : theme.textMuted }]}>{t('theme_dark')}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity testID="theme-toggle-system" accessibilityRole="button" accessibilityState={{ selected: themeMode === 'system' }} accessibilityLabel={t('theme_system')} style={[s.themeBtn, { backgroundColor: themeMode === 'system' ? accent : 'transparent', borderColor: themeMode === 'system' ? accent : theme.border }]} onPress={() => setThemeMode('system')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Feather name="smartphone" size={13} color={themeMode === 'system' ? onAccent : theme.textMuted} /><Text style={[s.themeBtnText, { color: themeMode === 'system' ? onAccent : theme.textMuted }]}>{t('theme_system')}</Text></View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.settingsRow, { marginTop: 12, flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}><Feather name="globe" size={14} color={theme.text} /><Text style={[s.settingLabel, { color: theme.text }]}>{t('language')}</Text></View>
            <View style={s.langGrid}>
              {LANGS.map(l => (
                <TouchableOpacity key={l.code} style={[s.langCard, { backgroundColor: theme.bg, borderColor: theme.border }, lang === l.code && { backgroundColor: accent, borderColor: accent }]} onPress={() => { setLang(l.code); setLanguage(l.code); }}>
                  <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                  <Text style={[s.langCardText, { color: theme.textSecondary }, lang === l.code && { color: onAccent }]} numberOfLines={1}>{l.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {Platform.OS === 'web' ? (
          <TouchableOpacity style={s.versionRow} onPress={async () => {
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
          }}>
            <Text style={[s.versionText, { color: theme.textMuted }]}>{APP_VERSION_LABEL}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[s.versionRow, s.versionText, { color: theme.textMuted }]}>{APP_VERSION_LABEL}</Text>
        )}

        {QA_HOOK_ALLOWED ? (
          <TouchableOpacity style={s.logoutBtn} onPress={async () => { try { await signOut(); } catch {} }} testID="qa-debug-logout" accessibilityLabel="QA debug logout">
            <Text style={s.logoutText}>QA logout (dev only)</Text>
          </TouchableOpacity>
        ) : null}

        {QA_HOOK_ALLOWED ? (
          <TouchableOpacity style={s.logoutBtn} onPress={() => navigation.navigate('Citizenship')} testID="qa-open-verification" accessibilityLabel="QA open verification">
            <Text style={s.logoutText}>QA verification (dev only)</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={s.logoutBtn} onPress={async () => {
          const ok = await askConfirm(t('logout_title') || t('logout'), t('logout_message'), t('logout_confirm') || t('logout'));
          if (!ok) return;
          try { await signOut(); } catch {}
        }} testID="profile-logout">
          <Text style={s.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <AppConfirmModal visible={!!confirmDialog} title={confirmDialog?.title} message={confirmDialog?.message} cancelLabel={t('cancel')} confirmLabel={confirmDialog?.confirmLabel || t('confirm')} onCancel={() => settleConfirm(false)} onConfirm={() => settleConfirm(true)} testID="profile-confirm-modal" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  proCard: { borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 14 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  proTitle: { fontSize: 14, fontWeight: '700' },
  proSub: { fontSize: 11, marginTop: 2 },
  proStatusBadge: { minHeight: 30, borderRadius: 15, borderWidth: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  proStatusBadgeText: { fontSize: 12, fontWeight: '900' },
  proTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  proFill: { height: '100%', borderRadius: 3 },
  proCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingVertical: 11, borderRadius: 10, marginTop: 12 },
  proCtaText: { fontSize: 13, fontWeight: '700' },
  becomeDriverBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14 },
  becomeDriverText: { color: '#FFF', fontSize: 14, fontWeight: '800', flex: 1 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, marginBottom: 14, position: 'relative' },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  profileInfo: { flex: 1, gap: 3 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  verifiedDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  phone: { fontSize: 12, flexShrink: 1 },
  ratingInline: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  subtitle: { fontSize: 12 },
  editBtnInline: { position: 'absolute', top: 10, right: 10, padding: 4 },
  menuGroup: { borderRadius: 10, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  menuSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
  menuIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '600' },
  menuSub: { fontSize: 11, marginTop: 1 },
  settingsCard: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 12 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { fontSize: 13, fontWeight: '600' },
  themeBtn: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  themeBtnText: { fontSize: 12, fontWeight: '700' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  langCard: { width: '23.5%', minWidth: 68, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, alignItems: 'center', gap: 3 },
  langCardText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  versionRow: { alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  versionText: { fontSize: 11, fontWeight: '500' },
  logoutBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#57534E', fontSize: 13 },
});