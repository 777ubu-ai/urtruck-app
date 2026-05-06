// RoleScreen — full welcome surface with REAL Pressable buttons.
//
// Stage 26: invisible bitmap hotspots are gone for good. The hero
// PNG is shown in the top half of the screen (cropped via an
// `overflow: hidden` container so the bitmap's own button area
// drops below the visible edge). Below it sit three honest-to-god
// `<Pressable>`s with real text, real height, real backgrounds —
// nothing depends on bitmap coordinates, nothing is zero-opacity,
// nothing is positioned absolutely against image dimensions.
//
// History:
//   v66 — pixel-math hotspots from useSafeAreaInsets/useWindowDimensions.
//         Failed on iPhone Safari first-paint (insets returned 0/0
//         then updated, the lower pill landed off-screen).
//   v72 — percent positions inside an aspectRatio container.
//         Looked correct in Playwright but on a real iPhone the
//         lower half of the bitmap was being intercepted by an
//         empty View React-Native-Web treats as untappable.
//   Stage 26 — abandoned the entire "transparent hotspot over a
//         bitmap" idea. Real buttons below the hero. Tap targets
//         are real DOM elements with real bounding boxes.

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

// Source aspect (941:1672 portrait).
const IMAGE_ASPECT = 941 / 1672;

// How much of the image's height we let into the hero crop. The
// bitmap places its decorative buttons starting around y=60% — we
// stop just above that so the rendered hero shows wordmark + truck
// + grille glow but the bitmap buttons fall off the bottom edge.
const HERO_VISIBLE = 0.6; // 60% of the bitmap's height visible

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole, session } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const enterAs = async (role) => {
    if (busy) return;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[RoleScreen] role-${role} pressed`);
    }
    setBusy(role);
    setError('');
    try {
      // Если у пользователя уже есть session+token (например он
      // нажал "Сменить роль" в профиле), не создаём нового гостя —
      // просто перезаписываем role и идём дальше.
      if (session && session.user) {
        setRole(role);
        navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
        return;
      }
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
      // eslint-disable-next-line no-console
      console.warn('[RoleScreen] enterAs failed:', e?.message || e);
      setError(t('connection_failed'));
      setBusy(null);
    }
  };

  const goAuth = () => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[RoleScreen] role-login pressed');
    }
    try {
      navigation.navigate('Auth');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[RoleScreen] navigate Auth failed:', e?.message || e);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/*
        Top hero. Container has a fixed flex share + `overflow: hidden`.
        The image inside is rendered with `aspectRatio: IMAGE_ASPECT`
        and absolutely positioned so it can be wider than the
        container and crop naturally. We ALSO scale down to
        HERO_VISIBLE so only the upper portion shows.
      */}
      <View style={styles.heroWrap}>
        <View style={styles.heroInner} pointerEvents="none">
          <Image
            source={ROLE_IMAGE}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityLabel="UrTruck"
          />
        </View>
      </View>

      {/* Real CTA buttons. Each one is a Pressable with real text,
          real height, real colours. testIDs stay the same so QA
          can locate them. */}
      <View style={styles.buttons}>
        <Pressable
          onPress={() => enterAs('driver')}
          disabled={!!busy}
          testID="role-driver"
          accessibilityRole="button"
          accessibilityLabel={t('role_driver_title') || 'Я водитель'}
          style={({ pressed }) => [
            styles.cta,
            styles.driverBtn,
            pressed && styles.ctaPressed,
            busy && busy !== 'driver' && styles.ctaDisabled,
          ]}
        >
          <Text style={styles.ctaTitle}>{t('role_driver_title') || 'Я водитель'}</Text>
          <Text style={styles.ctaSub}>{t('role_driver_desc') || 'Найти груз и не ехать порожняком'}</Text>
        </Pressable>

        <Pressable
          onPress={() => enterAs('client')}
          disabled={!!busy}
          testID="role-client"
          accessibilityRole="button"
          accessibilityLabel={t('role_client_title') || 'Я грузовладелец'}
          style={({ pressed }) => [
            styles.cta,
            styles.clientBtn,
            pressed && styles.ctaPressed,
            busy && busy !== 'client' && styles.ctaDisabled,
          ]}
        >
          <Text style={styles.ctaTitle}>{t('role_client_title') || 'Я грузовладелец'}</Text>
          <Text style={styles.ctaSub}>{t('role_client_desc') || 'Найти машину и получить ставки'}</Text>
        </Pressable>

        <Pressable
          onPress={goAuth}
          testID="role-login"
          accessibilityRole="button"
          accessibilityLabel={t('login_action') || 'Войти'}
          style={({ pressed }) => [styles.loginLink, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.loginText}>
            {t('already_have_account') || 'Уже есть аккаунт?'}{' '}
            <Text style={styles.loginLinkText}>{t('login_action') || 'Войти'}</Text>
          </Text>
        </Pressable>

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
  safe: { flex: 1, backgroundColor: '#0C0A09' },

  // ── Hero (top) ───────────────────────────────────────────────
  heroWrap: {
    flex: 1, // takes available top space
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#0C0A09',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  heroInner: {
    width: '100%',
    // The bitmap's full height = width / aspect. We show only the
    // top HERO_VISIBLE share of it via heroImage's negative margin.
    aspectRatio: IMAGE_ASPECT * (1 / HERO_VISIBLE),
    // Container itself shows full width × this scaled height.
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    aspectRatio: IMAGE_ASPECT, // full image dims
  },

  // ── CTA buttons (bottom) ─────────────────────────────────────
  buttons: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
    backgroundColor: '#0C0A09',
  },
  cta: {
    minHeight: 64,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  ctaDisabled: {
    opacity: 0.55,
  },
  driverBtn: {
    backgroundColor: '#16A34A', // emerald (Я водитель)
  },
  clientBtn: {
    backgroundColor: '#EA580C', // orange (Я грузовладелец)
  },
  ctaTitle: {
    color: '#FAFAF9',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  ctaSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  loginText: {
    color: '#A8A29E',
    fontSize: 14,
    fontWeight: '500',
  },
  loginLinkText: {
    color: '#22C55E',
    fontWeight: '800',
  },
  errorBox: {
    marginTop: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
