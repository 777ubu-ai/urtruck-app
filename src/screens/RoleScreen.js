// Stage 18 (v66 fit): full-image RoleScreen, pixel-accurate hotspots.
//
// What changed vs v65:
//   * v65 sized the image with ImageBackground + cover and placed
//     hotspots as fractions of `winW × winW/ASPECT`. On screens
//     where the image was wider OR taller than that math (cover
//     crops, ScrollView reflows the y-origin, safe-area insets
//     eat the bottom) the visible button and the touch zone
//     drifted apart — taps fell on the empty pixels next to the
//     pill instead of the pill itself.
//   * v66 uses contain-fit — we compute the real rendered rect
//     ourselves (scale = min(winW/IMAGE_W, availH/IMAGE_H)) and
//     position both the <Image/> and every hotspot relative to
//     that rectangle's `offsetX / offsetY`. Hotspot coordinates
//     live in *source pixels* (measured against the 941×1672 PNG)
//     and get scaled inline. That way: visible button and tap
//     zone always agree, regardless of viewport.
//   * ScrollView removed. On any reasonable phone the contain
//     scale fits the source comfortably; if the available height
//     ever falls below ~470px the image just letterboxes a little
//     more — the bottom "Войти" stays inside the rendered rect
//     because it's positioned in image-space, not viewport-space.
//
// Headlight blink and the auth flow (enterAs / setRole / navigation)
// are unchanged.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';

const ROLE_IMAGE = require('../../assets/role-screen-full.png');

// Source canvas (the approved hero render is 941×1672 portrait).
const IMAGE_W = 941;
const IMAGE_H = 1672;

// Hotspot rectangles in *source pixels*. Measured against the
// reference PNG so the same numbers describe each visible pill /
// link no matter how the screen is sized at runtime. Touch areas
// are slightly bigger than the visible button so small phones with
// thick fingers still register cleanly. If a future hero render
// moves the CTAs, re-measure on the source PNG and update these
// numbers — no other code change needed.
const SRC_HOTSPOTS = {
  // Green pill — "Я водитель"
  driver: { x: 50,  y: 1010, w: 841, h: 165 },
  // Orange pill — "Я грузовладелец"
  client: { x: 50,  y: 1190, w: 841, h: 165 },
  // Bottom "Войти" link
  login:  { x: 280, y: 1560, w: 380, h: 80  },
};

// Headlight glow rectangle — anchored over the *actual* LED
// headlamps at the bottom of the truck's nose, not the windshield.
//
// Stage 19 fix: v66 had y=575 which on the 941×1672 hero render
// lands roughly across the windshield / upper cab. The greeting
// pulse therefore lit up the glass — as if the truck blinked its
// roof, not its headlights. Cropping the source to a narrow
// y=800-900 band shows the LED strips spanning roughly x=140-610
// at y=810-855. Moving the glow there snaps the "ден-ден-ден"
// animation to the lights the user actually expects.
//
// Also narrower (470 vs 540) and shorter (45 vs 65) than v66 so
// the bloom doesn't bleed into the bumper or the grille area.
const SRC_HEADLIGHT = { x: 140, y: 810, w: 470, h: 45 };

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  // Available rectangle inside safe area. Floor at 120 so
  // weird boot states (insets > height) can't divide by zero.
  const availH = Math.max(120, winH - insets.top - insets.bottom);

  // Contain-fit: pick the smaller axis ratio so the entire image
  // is visible and never cropped. The other axis letterboxes.
  const scale = Math.min(winW / IMAGE_W, availH / IMAGE_H);
  const renderedW = IMAGE_W * scale;
  const renderedH = IMAGE_H * scale;
  const offsetX = (winW - renderedW) / 2;
  const offsetY = (availH - renderedH) / 2;

  // Translate a source-pixel rectangle into screen-space coords
  // for the current viewport. All hotspots and the headlight glow
  // share this conversion so they always line up with the image.
  const place = (rect) => ({
    left: offsetX + rect.x * scale,
    top: offsetY + rect.y * scale,
    width: rect.w * scale,
    height: rect.h * scale,
  });

  // Headlight blink — three short opacity pulses with a brief pause
  // between them. useNativeDriver=true keeps the animation off the
  // JS thread so it can never block the hotspots above it.
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

  const renderHotspot = (id, srcRect, onPress, label) => (
    <TouchableOpacity
      key={id}
      style={[styles.hotspot, place(srcRect)]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`role-${id}`}
      activeOpacity={0.6}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.stage} testID="role-screen-stage">
        {/* Image is positioned manually so its rect matches the
            offsetX/offsetY math above. resizeMode="contain" keeps
            it crisp inside that rect. pointerEvents="none" so the
            image never swallows taps meant for the hotspots. */}
        <Image
          source={ROLE_IMAGE}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: renderedW,
            height: renderedH,
          }}
          resizeMode="contain"
        />

        {/* Headlight blink overlay — pointerEvents none so the
            hotspots beneath stay tappable while it's animating. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.headlight,
            place(SRC_HEADLIGHT),
            { opacity: blink },
          ]}
        />

        {renderHotspot('driver', SRC_HOTSPOTS.driver, () => enterAs('driver'), 'Я водитель')}
        {renderHotspot('client', SRC_HOTSPOTS.client, () => enterAs('client'), 'Я грузовладелец')}
        {renderHotspot('login',  SRC_HOTSPOTS.login,  () => navigation.navigate('Auth'), 'Войти')}

        {error ? (
          <View pointerEvents="none" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, position: 'relative', backgroundColor: '#000' },
  hotspot: {
    position: 'absolute',
    backgroundColor: 'transparent',
    // Hotspots sit above the Image in DOM order so taps land on
    // them first. No explicit zIndex needed — RN respects child
    // order — but we add one defensively for web/Safari quirks.
    zIndex: 2,
  },
  headlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 252, 220, 0.55)',
    borderRadius: 24,
    shadowColor: '#FFF8C8',
    shadowOpacity: 1,
    shadowRadius: 30,
    zIndex: 1,
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
    zIndex: 3,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
