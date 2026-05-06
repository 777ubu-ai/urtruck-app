// RoleScreen — full-image welcome + role pick.
//
// One approved hero render (`assets/role-screen-full.png`) carries
// the wordmark, tagline, truck illustration and the visual buttons.
// On top we layer three invisible TouchableOpacity hotspots that
// fire the real auth flow:
//   * "Я водитель"      → enterAs('driver')
//   * "Я грузовладелец" → enterAs('client')
//   * "Войти"           → navigation.navigate('Auth')
//
// Layout (v66): contain-fit. Compute the rendered image rect from
//   scale = min(winW / IMAGE_W, availH / IMAGE_H)
// then position both <Image/> and every hotspot in screen space
// via offsetX/offsetY + sourceRect * scale. That way the visible
// button and its tap zone always agree.
//
// Stage 20 removed the headlight blink animation entirely — no
// more Animated.Value, no more pulsing overlay. The brief now
// reads "никаких анимаций, свечений, миганий, фейковых эффектов",
// and the screen is purely the bitmap + the three hotspots.

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
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

// Hotspot rectangles in *source pixels*, measured against the
// reference PNG. Touch areas are slightly bigger than the visible
// button so small phones with thick fingers still register
// cleanly. If a future hero render moves the CTAs, re-measure on
// the source PNG and update these numbers — no other code change
// needed.
const SRC_HOTSPOTS = {
  // Green pill — "Я водитель"
  driver: { x: 50,  y: 1010, w: 841, h: 165 },
  // Orange pill — "Я грузовладелец"
  client: { x: 50,  y: 1190, w: 841, h: 165 },
  // Bottom "Войти" link
  login:  { x: 280, y: 1560, w: 380, h: 80  },
};

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  // Available rectangle inside safe area. Floor at 120 so weird
  // boot states (insets > height) can't divide by zero.
  const availH = Math.max(120, winH - insets.top - insets.bottom);

  // Contain-fit: pick the smaller axis ratio so the entire image
  // is visible and never cropped. The other axis letterboxes.
  const scale = Math.min(winW / IMAGE_W, availH / IMAGE_H);
  const renderedW = IMAGE_W * scale;
  const renderedH = IMAGE_H * scale;
  const offsetX = (winW - renderedW) / 2;
  const offsetY = (availH - renderedH) / 2;

  // Translate a source-pixel rectangle into screen-space coords
  // for the current viewport. All hotspots share this conversion
  // so they always line up with the rendered image.
  const place = (rect) => ({
    left: offsetX + rect.x * scale,
    top: offsetY + rect.y * scale,
    width: rect.w * scale,
    height: rect.h * scale,
  });

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
            it crisp. pointerEvents="none" so the image never
            swallows taps meant for the hotspots. */}
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
    // them first. zIndex set defensively for web/Safari quirks.
    zIndex: 2,
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
