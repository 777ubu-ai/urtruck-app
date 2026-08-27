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
import { isSocialAuthCallback } from '../../utils/socialAuth';
import { brand, useBrand, radius, typography } from '../../theme/brandV2';

const QA_HOOK_ALLOWED = (() => {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  if (process.env.EXPO_PUBLIC_QA_HOOKS !== '1') return false;
  try {
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership !== 'standalone';
  } catch {
    return false;
  }
})();

const { width: SCREEN_W } = Dimensions.get('window');

const HERO_SLIDE_1 = require('../../../assets/onboarding/slide-1-hero.jpg');
const HERO_SLIDE_2 = require('../../../assets/onboarding/slide-2-driver-1.jpg');
const HERO_SLIDE_3 = require('../../../assets/onboarding/slide-2-driver-2.jpg');

const ASPECT_S1 = 709 / 650;
const ASPECT_S2 = 709 / 650;
const ASPECT_S3 = 709 / 700;

const WINDOW_S1 = { from: 0, to: 1 };
const WINDOW_S2 = { from: 0, to: 1 };
const WINDOW_S3 = { from: 0, to: 1 };

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

const Slide = ({ s, source, imageAspect, win, title, subtitle }) => (
  <View style={s.slide}>
    <HeroWindow source={source} imageAspect={imageAspect} win={win} />
    <View style={s.captionBlock}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle} numberOfLines={3}>{subtitle}</Text>
    </View>
  </View>
);

const QaLoginHook = ({ s }) => {
  const { signIn, setRole, refreshLevel } = useAuth();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onSubmit = async () => {
    const value = (token || '').trim();
    if (!value) {
      setErr('token required');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await signIn('qa-actor', 3, value);
      const me = await refreshLevel().catch(() => null);
      const role = me?.role && me.role !== 'guest' ? me.role : 'client';
      setRole(role);
    } catch {
      setErr('login failed');
    } finally {
      setBusy(false);
      setToken('');
    }
  };

  return (
    <View style={s.qaBlock} testID="qa-debug-block">
      <Text style={s.qaLabel}>QA login (dev only)</Text>
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
            imageAspect={ASPECT_S1}
            win={WINDOW_S1}
            title={t('onb_v2_slide1_title')}
            subtitle={t('onb_v2_slide1_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            s={s}
            source={HERO_SLIDE_2}
            imageAspect={ASPECT_S2}
            win={WINDOW_S2}
            title={t('onb_v2_slide2_title')}
            subtitle={t('onb_v2_slide2_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            s={s}
            source={HERO_SLIDE_3}
            imageAspect={ASPECT_S3}
            win={WINDOW_S3}
            title={t('onb_v2_slide3_title')}
            subtitle={t('onb_v2_slide3_subtitle')}
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
