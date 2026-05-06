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

// Stage 27 v2: hero PNG обрезан физически (сборка `sips --cropOffset 0
// 0 -c 1003 941`) — теперь это `role-screen-hero.png` 941×1003,
// которая содержит только верхнюю часть оригинала: UrTruck +
// тэглайн + грузовик с подсветкой. Раньше пытались crop'ить тот
// же `role-screen-full.png` через overflow:hidden + aspectRatio
// в RN-Web, но WebKit неустойчиво обрабатывал position:absolute
// width:100% aspectRatio внутри flex-контейнера и картинка
// растягивалась шире viewport (заголовок UrTruck обрезался по
// краям на скриншотах). Физический crop устраняет все хаки
// рендера: используем `resizeMode="contain"`, картинка вписывается
// в свой контейнер без overflow.
const ROLE_IMAGE = require('../../assets/role-screen-hero.png');

// Hero aspect after crop (top ~60% of original 941×1672 = 941×1000).
// Stage 28: возвращаем красивый дизайн — UrTruck wordmark + тэглайн
// "Международные перевозки" + "Грузы и машины без посредников" +
// полный грузовик. Bitmap-CTA пилюли (на оригинале начинаются с
// y≈1067) обрезаны вне crop. Stage 27 ошибочно cropала до 470/700,
// что роняло заголовок и оставляло только грузовик — дизайн стал
// дешёвым.
const HERO_ASPECT = 941 / 1000;

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
      {/* Stage 27: max-width 480px column, centered. На desktop/web
          ширина viewport бывает 1200+, и hero+buttons раздувались до
          кричащих пропорций. Mobile-first шейп остаётся на телефоне
          (480px > почти любого мобильного viewport), а desktop
          получает аккуратную колонку с letterbox по бокам. */}
      <View style={styles.outer}>
        <View style={styles.column} testID="role-screen-column">
          <View style={styles.heroWrap} pointerEvents="none">
            <Image
              source={ROLE_IMAGE}
              style={styles.heroImage}
              resizeMode="contain"
              accessibilityLabel="UrTruck"
            />
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
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0C0A09' },

  // Stage 27: outer flex container centring a max-480px column.
  // Wide desktop screens get black letterboxing on the sides
  // instead of a stretched hero.
  outer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#0C0A09',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  // ── Hero (top) ───────────────────────────────────────────────
  // Stage 27 v2: simplest possible. Container fills the available
  // top space (`flex: 1`) and the image inside is `contain`-fit
  // — никаких absolute / aspectRatio / overflow хаков. PNG уже
  // обрезан до нужной высоты (941×1003), поэтому `contain` сразу
  // даёт корректную композицию.
  heroWrap: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0C0A09',
  },
  heroImage: {
    flex: 1,
    width: '100%',
    height: '100%',
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
