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
  { code: 'RU', flag: '🇷🇺', name: 'Русский' },
  { code: 'EN', flag: '🇬🇧', name: 'English' },
  { code: 'KK', flag: '🇰🇿', name: 'Қазақша' },
  { code: 'ZH', flag: '🇨🇳', name: '中文' },
];

// Same gate as OnboardingV2Screen — Maestro QA harness uses this to switch
// between actors without driving the iOS Alert dialog.
const QA_HOOK_ALLOWED = (() => {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  try {
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership !== 'standalone';
  } catch {
    return false;
  }
})();

// Реальная версия приложения (раньше была захардкожена «v1.0.50 · 17.04.2026»,
// что вводило в заблуждение). Берём фактические значения сборки из expo-constants:
// nativeAppVersion = app.json version (1.0.2), nativeBuildVersion = номер сборки
// (например 38). На web build-номера нет → показываем только версию.
// Preview-сборки (05.08.2026): EXPO_PUBLIC_BUILD_COMMIT инлайнится Expo в
// бандл на этапе сборки, если задан при `expo export`. На проде/CI (deploy.sh,
// deploy.yml) переменная не задана → суффикс пустой, метка не меняется.
const APP_VERSION_LABEL = (() => {
  try {
    const Constants = require('expo-constants').default;
    const ver = Constants?.nativeAppVersion || Constants?.expoConfig?.version || '1.0.4';
    const build = Constants?.nativeBuildVersion
      || Constants?.expoConfig?.ios?.buildNumber
      || Constants?.expoConfig?.android?.versionCode
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
  // PR-D1 (build 18): driver-акцент мигрировал на изумрудный неон #168759.
  // См. theme/designV1.js — этот цвет тяжёл для светлого фона, поэтому
  // на белых кнопках текст рендерится чёрным (driverOnAccent). #168759
  // ниже сохранён для семантических success-индикаторов (verified-tick,
  // загруженный документ) — там это «успех», а не бренд водителя.
  const accent = isDriver ? '#168759' : '#FF8400';
  const onAccent = isDriver ? '#0C0A09' : '#0C0A09';
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
  const { t, lang: uiLang } = useI18n();
  const tonUnit = uiLang === 'ZH' ? '吨' : uiLang === 'EN' ? 't' : 'т';
  const cubicMeterUnit = uiLang === 'ZH' ? '立方米' : 'м³';
  const { session, signOut, verificationLevel } = useAuth();
  const [profile, setProfile] = useState(getProfile(session?.user?.id) || {});
  const [lang, setLang] = useState(getLanguage());
  const [confirmDialog, setConfirmDialog] = useState(null);
  const askConfirm = useCallback((title, message = '', confirmLabel = t('confirm')) => new Promise((resolve) => setConfirmDialog({ title, message, confirmLabel, resolve })), [t]);
  const settleConfirm = useCallback((answer) => { setConfirmDialog((current) => { current?.resolve?.(answer); return null; }); }, []);

  // HOT-001: Подтягиваем имя/город с сервера при КАЖДОМ открытии (focus).
  // Так изменения из EditProfile сразу видны после goBack().
  const fetchProfile = useCallback(async () => {
    try {
      const token = await storage.get('ur_reg_token');
      if (!token) return;
      const r = await fetch(`${API_BASE}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      // Строка водителя: данные машины + статус/балл после верификации.
      // /users/me их не возвращает — берём из /register/status.
      let st = null;
      try { st = await regAPI.status(); } catch {}
      // Выполненные рейсы — для уровня «Профи».
      let completedTrips = 0;
      try { const dash = await marketAPI.myDashboard(); completedTrips = countCompletedTrips(dash?.my_deals); } catch {}
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
            city: d.city || st?.city || prev?.city,
            bio: d.about || prev?.bio,
            // После верификации: машина/статус/балл из строки водителя, чтобы
            // профиль реально показывал сохранённые данные (а не «пусто»).
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
            // PR-D1: PRO-поля. Подтягиваем при focus — прогресс-бар PRO
            // и бейдж активного PRO обновятся сразу. Если backend ещё
            // не задеплоен с PRO — поля undefined и не затирают локал.
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

  // PR-C2 (WeChat redesign): grouped list — 4 items в одной карточке
  // с тонкими separators между ними. Иконки — Feather outline (унифицированный
  // muted gray), вместо разноцветных emoji. Это premium WeChat-style вид.
  // IA cleanup: «Мой статус» (рейтинг/документы/доверие) принадлежит Профилю,
  // а не вкладке «Очередь». Driver-only — у клиента нет driver-score.
  // Электронная очередь / CarGoRuqsat убраны из Профиля: они принадлежат
  // вкладке «Очередь» (единый Queue hub).
  // IA Phase 2: Chats — отдельная вкладка/путь (через сделку), НЕ дублируется
  // generic-рядом в Профиле. «Update app» убран из Профиля (см. ниже).
  const menuItems = [
    ...(isDriver ? [{ icon: 'shield', label: t('security_my_status'), sub: t('my_status_subtitle'), screen: 'Security', testID: 'profile-my-status' }] : []),
    { icon: 'star',          label: t('myReviews'),     screen: 'Reviews', testID: 'profile-my-reviews' },
    { icon: 'heart',         label: t('favorites_title'), screen: 'Favorites', testID: 'profile-favorites' },
    // Этап 6.4: возвращаем полезные экраны, которые были недостижимы (сироты).
    { icon: 'help-circle',   label: t('howit_header'),  screen: 'HowItWorks', testID: 'profile-how-it-works' },
    { icon: 'info',          label: t('about_title'),   screen: 'About', testID: 'profile-about' },
  ];

  // PR-C2 (driver card): canonical specs line «Тент · 20 т · 86 м³».
  // Раньше строка собиралась как `${truckType} · ${plate_truck} · ${capacity}t`
  // — это (1) показывало номер тягача в публичном виде, (2) использовало
  // латинскую `t` без пробела, (3) пропускало volume_m3 полностью.
  // Spec from image_31.png: «Тент · 20 т · 86 м³».
  const specsLine = isDriver
    ? [
        t(profile.truckType || 'tent'),
        profile.capacity_tons != null && profile.capacity_tons !== '' ? `${profile.capacity_tons} ${tonUnit}` : null,
        profile.available_m3 != null && profile.available_m3 !== '' ? `${profile.available_m3} ${cubicMeterUnit}` : null,
      ].filter(Boolean).join(' · ')
    : [
        // company_type показываем ТОЛЬКО если реально заполнен. Раньше стоял
        // дефолт 'importer' → у каждого клиента висел ложный «Прямой импортёр»,
        // хотя поле нигде не сохраняется (решение владельца 2026-06-13: убрать).
        profile.company_type ? t(profile.company_type) : null,
        localizePlace(profile.city, uiLang),
      ].filter(Boolean).join(' · ');

  const phoneRoleLine = `${session?.user?.phone || ''} · ${isDriver ? t('role_driver') : t('role_shipper')}`;

  // PR-D1: PRO-прогресс. Считаем 4 ключевых поля расширенного профиля
  // (legal_form, china_experience_years, favorite_borders, emergency_contact).
  // В бета-периоде PRO активируется автоматически при заполнении 4/4 —
  // см. CLAUDE.md «IS_BETA = true: всё платное бесплатно».
  // Показывается только для driver — клиенту PRO-статус не релевантен.
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

  // Русский плюрализатор для «N пункт/пункта/пунктов». Для остальных локалей
  // используем общий ключ items_many.
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
          {/* Профиль теперь pushed-экран (открывается из ☰ в ленте), а не
              корневая вкладка — нужна кнопка «назад». */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            {navigation.canGoBack?.() ? (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="profile-back"
                accessibilityLabel={t('back')}
              >
                <Feather name="arrow-left" size={24} color={theme.text} />
              </TouchableOpacity>
            ) : null}
            <GradientText style={s.title} colors={isDriver ? ['#168759', '#00C766'] : ['#FF8400', '#EF4444']}>{t('profile')}</GradientText>
          </View>
          <HelpButton accent={accent} />
        </View>

        {/* PR-C2 (WeChat horizontal card): avatar слева, текст справа стеком.
            Compact 80px высоты вместо 200px вертикальной. */}
        <View style={[s.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[s.avatar, { borderColor: accent + '40' }]} />
          ) : (
            <View style={[s.avatar, { backgroundColor: accent + '20', borderColor: accent + '30' }]}>
              <Feather name={isDriver ? 'truck' : 'package'} size={24} color={accent} />
            </View>
          )}
          <View style={s.profileInfo}>
            {/* Row 1: имя + subtle verified checkmark если verified */}
            <View style={s.profileNameRow}>
              <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
                {profile.display_name || profile.full_name || t('add_name')}
              </Text>
              {profile.is_verified ? (
                <View style={[s.verifiedDot, { backgroundColor: '#168759' }]}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 6 }}>
                  <Feather name="star" size={12} color="#D97706" />
                  <Text style={[s.ratingInline, { color: '#D97706' }]}>{profile.rating || 5.0}</Text>
                </View>
              ) : null}
            </View>
            {/* Row 3: specs — Тент · 20 т · 86 м³ */}
            {specsLine ? (
              <Text style={[s.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {specsLine}
              </Text>
            ) : null}
            {/* Row 4: статус-тир водителя (Новичок → Проверенный → Профи) */}
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
          {/* ЭТАП 1 (canonical): карандаш = редактирование профиля (EditProfile).
              Документная PRO-верификация запускается кнопкой «Получить статус
              PRO» ниже и из SecurityScreen — обе ведут в единый канонический
              flow ('Identity' → Selfie → VehicleDocs → TruckParams → submit).
              Раньше карандаш открывал Premium 'Reg' (имя+город), что путало
              редактирование профиля с документной верификацией. */}
          <TouchableOpacity style={s.editBtnInline} onPress={() => navigation.navigate('EditProfile', { role })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="edit-2" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* PR-D1: PRO-блок. Для driver — прогресс заполнения расширенного
            профиля и CTA «Получить статус PRO». При 4/4 — бейдж «PRO активен»
            и note про бета-период (бесплатно). Для client скрыт. */}
        {isDriver ? (
          <View style={[s.proCard, { backgroundColor: theme.card, borderColor: proActive ? accent : theme.border }]}>
            <View style={s.proHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="star" size={15} color={theme.text} />
                  <Text style={[s.proTitle, { color: theme.text }]}>
                    {proActive ? t('pro_active_badge') : t('pro_progress_title')}
                  </Text>
                </View>
                {proActive ? (
                  IS_BETA ? (
                    <Text style={[s.proSub, { color: theme.textMuted }]}>{t('pro_beta_note')}</Text>
                  ) : null
                ) : (
                  <Text style={[s.proSub, { color: theme.textMuted }]}>
                    {t('pro_progress_remaining')} {proRemaining} {itemsWord(proRemaining)}
                  </Text>
                )}
              </View>
              <Text style={[s.proPercent, { color: accent }]}>{proPercent}%</Text>
            </View>
            <View style={[s.proTrack, { backgroundColor: theme.bg }]}>
              <View style={[s.proFill, { width: `${proPercent}%`, backgroundColor: accent }]} />
            </View>
            {!proActive ? (
              <TouchableOpacity
                style={[s.proCta, { backgroundColor: accent }]}
                onPress={() => {
                  // D1 (Maestro P1): «Получить статус PRO» raньше всегда
                  // звал navigation.navigate('Identity') — а для уже
                  // подтверждённого водителя (verificationLevel >= IDENTITY=2)
                  // это перепрохождение полной 5-шаговой регистрации
                  // вместо заполнения 4 PRO-полей (legal_form,
                  // china_experience_years, favorite_borders,
                  // emergency_contact), которые живут в EditProfile.
                  // Теперь:
                  //   level < 2 → Identity (нужна сначала идентификация)
                  //   level ≥ 2 → EditProfile c focus:'pro' — там уже
                  //                есть нужные поля; флаг 'pro' позволит
                  //                EditProfile-у в будущем скроллить к
                  //                PRO-секции (сейчас он его игнорирует
                  //                — без вреда).
                  if ((verificationLevel || 0) >= 2) {
                    navigation.navigate('EditProfile', { role, focus: 'pro' });
                  } else {
                    navigation.navigate('Citizenship');
                  }
                }}
                activeOpacity={0.85}
                testID="profile-pro-cta"
                accessibilityLabel={t('pro_become_btn')}
              >
                <Text style={[s.proCtaText, { color: onAccent }]}>{t('pro_become_btn')}</Text>
                <Feather name="chevron-right" size={18} color={onAccent} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Кнопка «Стать водителем» убрана из профиля грузоотправителя
            (решение владельца 2026-06-13): зелёный driver-CTA, ведущий в
            driver-верификацию, был чужеродным в оранжевом клиентском профиле. */}

        {/* PR-C2 (WeChat grouped list): 4 menu items в одной карточке
            с тонкими separators. Без emoji — Feather outline icons. */}
        <View style={[s.menuGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              {idx > 0 ? <View style={[s.menuSeparator, { backgroundColor: theme.border }]} /> : null}
              <TouchableOpacity
                style={s.menuRow}
                onPress={() => item.screen && navigation.navigate(item.screen, { role, targetId: session?.user?.id })}
                activeOpacity={0.6}
                testID={item.testID}
                accessibilityLabel={item.label}
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
                testID="theme-toggle-light"
                accessibilityRole="button"
                accessibilityState={{ selected: !isDark }}
                accessibilityLabel={t('theme_light')}
                style={[s.themeBtn, { backgroundColor: isDark ? 'transparent' : accent, borderColor: isDark ? theme.border : accent }]}
                onPress={() => { if (isDark) toggleTheme(); }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="sun" size={13} color={isDark ? theme.textMuted : onAccent} />
                  <Text style={[s.themeBtnText, { color: isDark ? theme.textMuted : onAccent }]}>{t('theme_light')}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                testID="theme-toggle-dark"
                accessibilityRole="button"
                accessibilityState={{ selected: isDark }}
                accessibilityLabel={t('theme_dark')}
                style={[s.themeBtn, { backgroundColor: isDark ? accent : 'transparent', borderColor: isDark ? accent : theme.border }]}
                onPress={() => { if (!isDark) toggleTheme(); }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="moon" size={13} color={isDark ? onAccent : theme.textMuted} />
                  <Text style={[s.themeBtnText, { color: isDark ? onAccent : theme.textMuted }]}>{t('theme_dark')}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.settingsRow, { marginTop: 12, flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Feather name="globe" size={14} color={theme.text} />
              <Text style={[s.settingLabel, { color: theme.text }]}>{t('language')}</Text>
            </View>
            <View style={s.langGrid}>
              {LANGS.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[s.langCard, { backgroundColor: theme.bg, borderColor: theme.border }, lang === l.code && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => { setLang(l.code); setLanguage(l.code); }}
                >
                  <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                  <Text style={[s.langCardText, { color: theme.textSecondary }, lang === l.code && { color: onAccent }]} numberOfLines={1}>
                    {l.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.pushBtn, { backgroundColor: theme.bg, borderColor: theme.border }]}
            onPress={() => navigation.navigate('PushFilter', { role })}
            testID="profile-push-filter"
            accessibilityLabel={t('pushFilter')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="bell" size={14} color={theme.text} />
              <Text style={[s.settingLabel, { color: theme.text }]}>{t('pushFilter')}</Text>
            </View>
            <Text style={[s.configureBtn, { color: accent }]}>{t('configure')} →</Text>
          </TouchableOpacity>
        </View>

        {/* IA Phase 2: убрана большая CTA «Обновить приложение» — на native
            это был no-op (нет Expo Updates / updateAvailable). Оставлена
            пассивная версия. На web версия-текст остаётся тап-таргетом для
            сброса PWA-кеша (реальная функция web), без громкой кнопки. */}
        {Platform.OS === 'web' ? (
          <TouchableOpacity
            style={s.versionRow}
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
            <Text style={[s.versionText, { color: theme.textMuted }]}>{APP_VERSION_LABEL}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[s.versionRow, s.versionText, { color: theme.textMuted }]}>{APP_VERSION_LABEL}</Text>
        )}

        {/* «Сменить роль» убрана по решению владельца (13.06): смена роли
            требует переустановки role-specific данных (труки водителя и т.п.).
            Кому нужна другая роль — полностью выходит и заходит заново. */}

        {QA_HOOK_ALLOWED ? (
          <TouchableOpacity
            style={s.logoutBtn}
            onPress={async () => {
              // signOut() чистит session+hasToken → AppNavigator реактивно
              // переключает на неавторизованный стек. Доп. reset не нужен
              // (бил в OnboardingV2, которого нет в authenticated-стеке → тост-ошибка).
              try { await signOut(); } catch {}
            }}
            testID="qa-debug-logout"
            accessibilityLabel="QA debug logout"
          >
            <Text style={[s.logoutText, { color: v1.textMuted }]}>QA logout (dev only)</Text>
          </TouchableOpacity>
        ) : null}

        {/* QA (dev-only): прямой вход в флоу верификации водителя. qa-debug login
            хардкодит level 3, поэтому штатный pro-CTA (level≥2 → EditProfile) не
            ведёт в регистрацию; этот хук даёт Maestro пройти Гражданство →
            документ личности → техпаспорт → права. В проде не рендерится. */}
        {QA_HOOK_ALLOWED ? (
          <TouchableOpacity
            style={s.logoutBtn}
            onPress={() => navigation.navigate('Citizenship')}
            testID="qa-open-verification"
            accessibilityLabel="QA open verification"
          >
            <Text style={[s.logoutText, { color: v1.textMuted }]}>QA verification (dev only)</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={async () => {
            const ok = await askConfirm(t('logout_title') || t('logout'), t('logout_message'), t('logout_confirm') || t('logout'));
            if (!ok) return;
            try { await signOut(); } catch {}
          }}
          testID="profile-logout"
        >
          <Text style={[s.logoutText, { color: v1.textMuted }]}>{t('logout')}</Text>
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

  // PR-D1: PRO progress card
  proCard: { borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 14 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  proTitle: { fontSize: 14, fontWeight: '700' },
  proSub: { fontSize: 11, marginTop: 2 },
  proPercent: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  proTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  proFill: { height: '100%', borderRadius: 3 },
  proCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingVertical: 11, borderRadius: 10, marginTop: 12,
  },
  proCtaText: { fontSize: 13, fontWeight: '700' },

  // Driver-verification entry CTA (2026-06-11) — компактная зелёная
  // строка под profile card. На client'а наглядно говорит, что приложение
  // двустороннее.
  becomeDriverBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
  },
  becomeDriverText: { color: '#FFF', fontSize: 14, fontWeight: '800', flex: 1 },

  // PR-C2 (WeChat horizontal card)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 10,
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
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  verifiedDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  phone: { fontSize: 12, flexShrink: 1 },
  ratingInline: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  subtitle: { fontSize: 12 },
  editBtnInline: { position: 'absolute', top: 10, right: 10, padding: 4 },

  // PR-C2 (WeChat grouped list)
  menuGroup: {
    borderRadius: 10,
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
  settingsCard: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 12 },
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
  langCardText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  pushBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  configureBtn: { fontSize: 12, fontWeight: '700' },

  versionRow: { alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  versionText: { fontSize: 11, fontWeight: '500' },
  logoutBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#57534E', fontSize: 13 },
});
