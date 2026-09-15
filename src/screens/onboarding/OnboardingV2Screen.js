// OnboardingV2Screen — inDrive-style welcome с 3 слайдами карусели.
//
// OAuth cold-start invariant: Google/Apple can return after a full web reload
// or after iOS/Android has killed the app. In both cases this onboarding screen
// is the first unauthenticated route, so it must detect the dedicated social
// callback and hand it to PhoneV2 instead of leaving the user at the welcome
// carousel with an unconsumed provider token.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../utils/AuthContext';
import { isSocialAuthCallback, takeBufferedSocialCallbackUrl } from '../../utils/socialAuth';
import { brand, useBrand, radius, typography } from '../../theme/brandV2';
import { API_BASE } from '../../config/env';

const QA_HOOK_ALLOWED = (() => {
  try {
    const Constants = require('expo-constants').default;
    // Physical QA2 hook is legal only against an explicit non-production
    // backend. A QA2 APK pointed at urtruck.kz must never expose actor login.
    const flavor = Constants?.expoConfig?.extra?.urtruckBuildFlavor;
    const apiOverride = Constants?.expoConfig?.extra?.urtruckApiUrl || process.env.EXPO_PUBLIC_API_URL || '';
    const localQaApi = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(apiOverride);
    if (flavor === 'qa2' && localQaApi) return true;
    return !!(typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_QA_HOOKS === '1');
  } catch {
    return false;
  }
})();

const { width: SCREEN_W } = Dimensions.get('window');

const HERO_SLIDE_1 = require('../../../assets/onboarding/slide-1-hero.jpg');
const HERO_SLIDE_2 = require('../../../assets/onboarding/slide-2-driver-1.jpg');
const HERO_SLIDE_3 = require('../../../assets/onboarding/slide-2-driver-2.jpg');

const ONBOARDING_IMAGE_ASPECT = 864 / 1536;

// The approved assets reserve their lower portion for the separate UI copy.
// Keep the important upper composition and crop only the unused lower margin.
const WINDOW_S1 = { from: 0, to: 0.59 };
const WINDOW_S2 = { from: 0, to: 0.59 };
const WINDOW_S3 = { from: 0, to: 0.59 };

const HeroWindow = ({ source, imageAspect, win }) => {
  const imgHeight = SCREEN_W / imageAspect;
  const visiblePct = win.to - win.from;
  const containerHeight = imgHeight * visiblePct;
  const topOffset = -win.from * imgHeight;
  return (
    <View
      pointerEvents="none"
      style={{ width: '100%', height: containerHeight, overflow: 'hidden' }}
    >
      <Image
        source={source}
        pointerEvents="none"
        resizeMode="contain"
        style={{
          width: SCREEN_W,
          height: imgHeight,
          position: 'absolute',
          top: topOffset,
          left: 0,
        }}
      />
    </View>
  );
};

const BrandLogo = ({ s }) => (
  <Text style={s.logo} accessibilityRole="header" testID="onb-v2-brand-logo">
    <Text style={{ color: brand.logoDark }}>Ur</Text>
    <Text style={{ color: brand.logoAccent }}>Truck</Text>
  </Text>
);

const Slide = ({ s, source, imageAspect, win, title }) => (
  <View style={s.slide}>
    <View style={s.logoWrap}>
      <BrandLogo s={s} />
    </View>
    <HeroWindow source={source} imageAspect={imageAspect} win={win} />
    <View style={s.captionBlock}>
      <Text style={s.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.86}>{title}</Text>
    </View>
  </View>
);

const QaLoginHook = ({ s }) => {
  const { signIn, setRole, refreshLevel } = useAuth();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const completeLogin = async (value) => {
    await signIn('qa-actor', 3, value);
    const me = await refreshLevel().catch(() => null);
    const role = me?.role && me.role !== 'guest' ? me.role : 'client';
    setRole(role);
  };

  const onSubmit = async () => {
    const value = (token || '').trim();
    if (!value) {
      setErr('token required');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await completeLogin(value);
    } catch {
      setErr('login failed');
    } finally {
      setBusy(false);
      setToken('');
    }
  };

  const onActor = async (actor) => {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/qa/ensure-actor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.token) throw new Error('actor session failed');
      await completeLogin(data.token);
    } catch {
      setErr(`actor login failed: ${actor}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.qaBlock} testID="qa-debug-block">
      <Text style={s.qaLabel}>QA login (dev only)</Text>
      <View style={s.qaActorRow}>
        {[
          ['boris', 'Boris · shipper'],
          ['serik', 'Serik · driver'],
          ['askar', 'Askar · driver'],
        ].map(([actor, label]) => (
          <Pressable
            key={actor}
            testID={`qa-actor-${actor}`}
            accessibilityLabel={`QA actor ${actor}`}
            disabled={busy}
            onPress={() => onActor(actor)}
            style={[s.qaActorButton, busy && { opacity: 0.5 }]}
          >
            <Text style={s.qaActorText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={s.qaInput}
        value={token}
        onChangeText={setToken}
        placeholder="paste actor token"
        placeholderTextColor={brand.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={false}
        testID="qa-debug-token"
        accessibilityLabel="QA debug token"
      />
      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={[s.qaSubmit, busy && { opacity: 0.5 }]}
        testID="qa-debug-submit"
        accessibilityLabel="QA debug submit"
      >
        <Text style={s.qaSubmitText}>{busy ? '…' : 'QA login'}</Text>
      </Pressable>
      {err ? <Text style={s.qaErr} testID="qa-debug-error">{err}</Text> : null}
    </View>
  );
};

export default function OnboardingV2Screen({ navigation }) {
  const _b = useBrand();
  const s = React.useMemo(() => makeStyles(_b), [_b]);
  const { t } = useI18n();
  const { toast } = useToast();
  const { ensureGuest } = useAuth();
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let active = true;
    let subscription = null;

    const handoff = (url) => {
      if (!active || !isSocialAuthCallback(url)) return;
      navigation.navigate('PhoneV2', { socialAuthUrl: url });
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      handoff(window.location.href);
    } else {
      // P0 auth-fix 28.08.2026: сперва — буфер module-level слушателя из
      // App.js (callback, прилетевший в «мёртвое окно» перезапуска, когда ни
      // один экран ещё не был смонтирован — раньше он терялся, и пользователю
      // приходилось жать Google второй раз).
      const buffered = takeBufferedSocialCallbackUrl();
      if (buffered) handoff(buffered);
      Linking.getInitialURL().then(handoff).catch(() => {});
      // Defensive listener: normally PhoneV2 owns the live callback because
      // OAuth starts there, but this protects navigation races/recovery.
      subscription = Linking.addEventListener('url', ({ url }) => handoff(url));
    }

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, [navigation]);

  const onScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_W);
    if (next !== idx) setIdx(next);
  };

  const goAuth = () => {
    navigation.navigate('PhoneV2');
  };

  const goGuest = async () => {
    let ok = false;
    try {
      const data = await ensureGuest();
      ok = !!(data && data.token);
    } catch {}
    if (!ok) {
      toast(t('no_connection'), 'error');
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { role: 'client', guest: true } }],
    });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_W }}>
          <Slide
            s={s}
            source={HERO_SLIDE_1}
            imageAspect={ONBOARDING_IMAGE_ASPECT}
            win={WINDOW_S1}
            title={t('onb_v2_slide1_title')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            s={s}
            source={HERO_SLIDE_2}
            imageAspect={ONBOARDING_IMAGE_ASPECT}
            win={WINDOW_S2}
            title={t('onb_v2_slide2_title')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            s={s}
            source={HERO_SLIDE_3}
            imageAspect={ONBOARDING_IMAGE_ASPECT}
            win={WINDOW_S3}
            title={t('onb_v2_slide3_title')}
          />
        </View>
      </ScrollView>

      <View style={s.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              s.dot,
              i === idx
                ? { backgroundColor: brand.primary, width: 22, height: 6, borderRadius: 3 }
                : { backgroundColor: brand.borderStrong },
            ]}
          />
        ))}
      </View>

      <View style={s.ctaWrap} pointerEvents="box-none">
        <Pressable
          onPress={goAuth}
          accessibilityRole="button"
          accessibilityLabel={t('phone_v2_title')}
          testID="onb-v2-cta-phone"
          style={({ pressed }) => [
            s.ctaPrimary,
            { backgroundColor: brand.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={s.ctaPrimaryText}>{t('phone_v2_title')}</Text>
          <View style={s.ctaArrowBubble}>
            <Feather name="arrow-right" size={24} color="#FFF" />
          </View>
        </Pressable>
        <Pressable
          onPress={goGuest}
          accessibilityRole="button"
          accessibilityLabel={t('onb_v2_cta_guest')}
          testID="onb-v2-cta-guest"
          style={({ pressed }) => [s.ctaOutline, pressed && { opacity: 0.85 }]}
        >
          <Feather name="package" size={18} color={brand.textPrimary} />
          <Text style={s.ctaOutlineText}>{t('onb_v2_cta_guest')}</Text>
          <Feather name="arrow-right" size={18} color={brand.textPrimary} />
        </Pressable>

        <Text style={s.consent}>
          {t('onb_v2_consent_prefix')}{' '}
          <Text style={s.consentLink}>{t('onb_v2_consent_offer')}</Text>
          {' '}{t('onb_v2_consent_and')}{' '}
          <Text style={s.consentLink}>{t('onb_v2_consent_privacy')}</Text>
        </Text>

        {QA_HOOK_ALLOWED ? <QaLoginHook s={s} /> : null}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  slide: { flex: 1, paddingHorizontal: 0, paddingTop: 6, alignItems: 'stretch' },
  logoWrap: { height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  logo: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1.1 },
  captionBlock: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4, alignItems: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: brand.textPrimary, textAlign: 'center', paddingHorizontal: 0 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 10, zIndex: 5, elevation: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ctaWrap: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 10, backgroundColor: brand.bg, zIndex: 10, elevation: 10 },
  ctaPrimary: {
    height: 58,
    borderRadius: 29,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 7,
    backgroundColor: '#0A9B57',
    borderWidth: 1,
    borderColor: '#17B86A',
    shadowColor: '#087B47',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  ctaPrimaryText: { ...typography.button, color: '#FFFFFF', flex: 1, textAlign: 'center', fontWeight: '800' },
  ctaArrowBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ctaOutline: { height: 56, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginTop: 8, borderWidth: 1, borderColor: brand.borderStrong, backgroundColor: brand.surface },
  ctaOutlineText: { ...typography.button, color: brand.textPrimary, flex: 1, textAlign: 'center', fontWeight: '700' },
  consent: { fontSize: 12, color: brand.textSecondary, textAlign: 'center', marginTop: 8 },
  consentLink: { color: brand.textPrimary, textDecorationLine: 'underline', fontWeight: '600' },
  qaBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: brand.borderStrong, gap: 6 },
  qaLabel: { fontSize: 11, color: brand.textSecondary, textAlign: 'center', fontWeight: '600' },
  qaActorRow: { flexDirection: 'row', gap: 6 },
  qaActorButton: { flex: 1, minHeight: 34, borderRadius: radius.md, borderWidth: 1, borderColor: brand.borderStrong, backgroundColor: brand.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  qaActorText: { color: brand.textPrimary, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  qaInput: { height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: brand.borderStrong, backgroundColor: brand.surface, paddingHorizontal: 10, color: brand.textPrimary, fontSize: 12 },
  qaSubmit: { height: 36, borderRadius: radius.md, backgroundColor: brand.borderStrong, alignItems: 'center', justifyContent: 'center' },
  qaSubmitText: { color: brand.textPrimary, fontSize: 12, fontWeight: '700' },
  qaErr: { fontSize: 11, color: '#EF4444', textAlign: 'center' },
});
