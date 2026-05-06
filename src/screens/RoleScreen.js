// Stage 18: full-image RoleScreen.
//
// The whole screen is one approved hero illustration
// (`assets/role-screen-full.png`) carrying the wordmark, headline,
// truck render and the three CTA stripes ("Я водитель",
// "Я грузовладелец", small "Войти" link). On top of the image we
// position three invisible TouchableOpacity hotspots that fire the
// real auth flow (`enterAs(driver)`, `enterAs(client)`,
// `navigation.navigate('Auth')`).
//
// Why an image-driven layout: the design team wants pixel-exact
// control of the truck composition, glow, and typography. Stage 17
// finished detail polish but the welcome screen stayed on the old
// BrandHeader + HeroTruck + RoleCard combo, which can't reproduce
// the marketing render.
//
// Headlight blink: a small Animated.Value pulses opacity 0→1→0
// three times after a short delay — "ден-ден-ден" greeting. The
// blink overlay sits above the image but is `pointerEvents="none"`
// so it never steals taps from the hotspots beneath.
//
// Asset note: until the real PNG lands, `assets/role-screen-full.png`
// is a 1×1 placeholder so the bundler doesn't fail. The hotspots
// still render at the correct fractional coordinates, so once the
// real asset replaces the placeholder the layout snaps into place
// without code changes.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ImageBackground,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';

const ROLE_IMAGE = require('../../assets/role-screen-full.png');

// Source aspect ratio per the brief (941 / 1672 portrait). Hotspot
// fractions are measured against this ratio so they stay correct
// when the screen is wider or narrower than the source.
const SRC_W = 941;
const SRC_H = 1672;
const ASPECT = SRC_W / SRC_H;

// Hotspot rectangles as fractions of the rendered image. Tuned to
// the v64.1 hero render (941×1672) where:
//   * UrTruck wordmark + tagline occupy the top ~18%
//   * the truck illustration takes the middle ~40%
//   * the green "Я водитель" pill sits at y≈0.62-0.72
//   * the orange "Я грузовладелец" pill sits at y≈0.74-0.84
//   * the small "Войти" link sits at y≈0.93-0.97
// Touch areas are slightly bigger than the visible buttons so small
// phones with thick fingers still register cleanly. If a future
// hero render moves the CTAs, re-measure on the source PNG and
// update these numbers — no other code change needed.
const HOTSPOTS = {
  driver: { left: 0.06, top: 0.61, width: 0.88, height: 0.11 },
  client: { left: 0.06, top: 0.73, width: 0.88, height: 0.11 },
  login:  { left: 0.28, top: 0.93, width: 0.44, height: 0.05 },
};

// Headlight glow rectangle — anchored over the truck's front grille
// where the LED headlamps sit on the source render. Pulsed three
// times on mount as the "ден-ден-ден" greeting.
const HEADLIGHT = { left: 0.20, top: 0.33, width: 0.60, height: 0.05 };

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  // Fit the image to viewport width; if the resulting height is
  // taller than the visible area, wrap in a ScrollView so the
  // bottom "Войти" hotspot is always reachable on small phones.
  const imgW = winW;
  const imgH = winW / ASPECT;
  const useScroll = imgH > winH;

  // Headlight blink — three short opacity pulses with a brief delay
  // between them. useNativeDriver=true so the animation runs off
  // the JS thread and never blocks tap handlers above it.
  const blink = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const pulse = () => Animated.sequence([
      Animated.timing(blink, { toValue: 1, duration: 90,  useNativeDriver: true }),
      Animated.timing(blink, { toValue: 0, duration: 110, useNativeDriver: true }),
    ]);
    Animated.sequence([
      Animated.delay(350),
      pulse(),
      Animated.delay(140),
      pulse(),
      Animated.delay(140),
      pulse(),
    ]).start();
  }, [blink]);

  const enterAs = async (role) => {
    if (busy) return;
    setBusy(role);
    setError('');
    try {
      const data = await regAPI.ensureGuest();
      if (!data?.token) {
        setError(t('server_unavailable'));
        setBusy(null);
        return;
      }
      await signIn('test-user', 1, data.token);
      setRole(role);
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch {
      setError(t('connection_failed'));
      setBusy(null);
    }
  };

  const renderHotspot = (id, area, onPress, label) => (
    <TouchableOpacity
      key={id}
      style={[
        styles.hotspot,
        {
          left: imgW * area.left,
          top: imgH * area.top,
          width: imgW * area.width,
          height: imgH * area.height,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`role-${id}`}
      activeOpacity={0.6}
    />
  );

  const sheet = (
    <View style={{ width: imgW, height: imgH, backgroundColor: '#000' }}>
      <ImageBackground
        source={ROLE_IMAGE}
        style={{ width: imgW, height: imgH }}
        resizeMode="cover"
      >
        {/* Headlight blink overlay — pointerEvents none so it never
            blocks the hotspots beneath even while animating. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.headlight,
            {
              left: imgW * HEADLIGHT.left,
              top: imgH * HEADLIGHT.top,
              width: imgW * HEADLIGHT.width,
              height: imgH * HEADLIGHT.height,
              opacity: blink,
            },
          ]}
        />

        {renderHotspot('driver', HOTSPOTS.driver, () => enterAs('driver'), 'Я водитель')}
        {renderHotspot('client', HOTSPOTS.client, () => enterAs('client'), 'Я грузовладелец')}
        {renderHotspot('login',  HOTSPOTS.login,  () => navigation.navigate('Auth'), 'Войти')}

        {/* Server-error toast pinned above the bottom edge so it
            stays inside the image even when the screen scrolls. */}
        {error ? (
          <View pointerEvents="none" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ImageBackground>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {useScroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {sheet}
        </ScrollView>
      ) : sheet}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  hotspot: { position: 'absolute', backgroundColor: 'transparent' },
  headlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 252, 220, 0.7)',
    borderRadius: 24,
    shadowColor: '#FFF8C8',
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  errorBox: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(40, 0, 0, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  errorText: { color: '#FCA5A5', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
