// RoleScreen — full-image welcome + role pick.
//
// Stage 25 fix: hotspot positioning rewritten from absolute pixel
// coordinates (computed via useWindowDimensions + safe-area insets)
// to **percent-based positions inside an aspect-ratio container**.
//
// Why the rewrite:
//   * v66 used `scale = min(winW / IMAGE_W, availH / IMAGE_H)` and
//     placed each hotspot at `top = offsetY + rect.y * scale`. On
//     real iPhones / narrow Safari viewports, `availH` was inferred
//     from `useSafeAreaInsets()` which returns 0/0 on the very
//     first render and updates a tick later. The image would
//     letterbox correctly, but the first paint of the hotspots used
//     stale offsets — and the "Я грузовладелец" rectangle (the
//     lower of the two pills) ended up just below the visible image
//     on some viewports, intercepted by an off-screen DOM region
//     that React-Native-Web treats as untappable.
//   * Percent-based positions inside a container locked to the
//     source aspect-ratio (941:1672) guarantee that the visible
//     button on the bitmap and the invisible Pressable always
//     occupy the same fraction of the container, regardless of
//     viewport size or safe-area inset.
//   * The container itself is centred and capped at 100% width AND
//     100% height so it letterboxes to whichever axis is smaller —
//     same visual effect as v66 contain-fit, but without per-frame
//     pixel math.
//
// Stage 20 still applies: no animation, no glow, no headlight.
// Stage 18: enterAs / setRole / navigation.reset auth flow
// preserved. testIDs `role-driver`, `role-client`, `role-login`
// kept stable for QA.

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';

const ROLE_IMAGE = require('../../assets/role-screen-full.png');

// Source canvas (the approved hero render is 941×1672 portrait).
const IMAGE_W = 941;
const IMAGE_H = 1672;
const ASPECT = IMAGE_W / IMAGE_H; // ≈ 0.563

// Hotspots expressed as percentages of the rendered container.
// Numbers come from the source PNG: each rect's left/top/width/
// height divided by IMAGE_W / IMAGE_H. Re-measure on the source
// PNG and edit here if the hero render ever changes.
//
// driver pill: y 1010-1175  (1010/1672 = 60.4%, height 9.9%)
// client pill: y 1190-1355  (71.2%, height 9.9%)
// login link:  y 1560-1640  (93.3%, height 4.8%)
const HOTSPOTS = {
  driver: { left: '5%',  top: '60.4%', width: '90%', height: '10.5%' },
  client: { left: '5%',  top: '71.2%', width: '90%', height: '10.5%' },
  login:  { left: '25%', top: '93.0%', width: '50%', height: '5.5%'  },
};

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

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
    } catch (e) {
      // Surface the *real* failure to the dev console so a recurring
      // production crash is visible without debugger attach.
      console.warn('[RoleScreen] enterAs failed:', e?.message || e);
      setError(t('connection_failed'));
      setBusy(null);
    }
  };

  const goAuth = () => {
    try {
      navigation.navigate('Auth');
    } catch (e) {
      console.warn('[RoleScreen] navigate Auth failed:', e?.message || e);
    }
  };

  const renderHotspot = (id, rect, onPress, label) => (
    <Pressable
      key={id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`role-${id}`}
      hitSlop={8}
      style={({ pressed }) => [
        styles.hotspot,
        rect,
        pressed && styles.hotspotPressed,
      ]}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.stageOuter} testID="role-screen-stage">
        {/*
          Inner aspect-ratio container. RN-web translates aspectRatio
          to CSS aspect-ratio; native RN respects it via Yoga. With
          maxWidth/maxHeight=100% it shrinks to whichever axis is
          binding, exactly the same effect as v66's contain-fit
          math, but without manual pixel work. Hotspots positioned
          in % stay in sync with the bitmap on any viewport.
        */}
        <View style={styles.stageInner}>
          <Image
            source={ROLE_IMAGE}
            style={styles.heroImage}
            resizeMode="contain"
            // RN-web 0.19+: pointerEvents prop is deprecated; the
            // CSS rule keeps the image transparent to taps so they
            // fall through to the Pressables below.
          />

          {renderHotspot('driver', HOTSPOTS.driver, () => enterAs('driver'), 'Я водитель')}
          {renderHotspot('client', HOTSPOTS.client, () => enterAs('client'), 'Я грузовладелец')}
          {renderHotspot('login',  HOTSPOTS.login,  goAuth, 'Войти')}

          {error ? (
            <View pointerEvents="none" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  stageOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    width: '100%',
    height: '100%',
  },
  // The contain-fit happens here: aspectRatio + max-* axes do the work.
  stageInner: {
    aspectRatio: ASPECT,
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    // CSS-only pointer-events for RN-web; ignored on native where
    // <Image> is non-touchable by default.
    pointerEvents: 'none',
  },
  hotspot: {
    position: 'absolute',
    backgroundColor: 'transparent',
    // zIndex above the image. RN-web honours zIndex on absolute
    // children, native respects DOM order.
    zIndex: 2,
    cursor: 'pointer',
  },
  hotspotPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
