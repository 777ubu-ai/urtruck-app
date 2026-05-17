// OnboardingV2Screen — inDrive-style welcome с 3 слайдами карусели.
//
// Stage RC2-window-crop (15 May):
//   Owner-проверка PR #35: PNG-логотип UrTruck в crop'е был гигантским
//   (~30% экрана), а сама иллюстрация (фура/cargo cards/driver+shield)
//   была обрезана снизу. Корень — top-anchored crop показывал верхние
//   X% PNG, включая логотип и status-bar, но НЕ всю illustration.
//
//   Window-crop (по обеим сторонам):
//     - Каждый слайд показывает **окно** из PNG: [fromPct, toPct] от
//       высоты файла. Сверху отрезаны status-bar + PNG-логотип
//       (fromPct ≈ 0.08-0.12). Снизу отрезаны PNG title/subtitle/dots/
//       CTAs/оферта (toPct ≈ 0.48-0.55).
//     - Внутри окна остаётся ТОЛЬКО illustration (карта+водитель+фура+
//       склад для slide 1, cargo card + bid cards + $-badge для slide
//       2, driver+shield+driver-card+route bar для slide 3).
//
//   Native UrTruck logo рисуется отдельно, **небольшого** размера
//   (fontSize 28 vs ~80 в PNG), брэнд остаётся консистентным, без
//   доминирования. Title/subtitle/paginator/CTAs/consent — native
//   через i18n.
//
//   Технически: container высота = (toPct - fromPct) * imgHeight,
//   image position:absolute top:(-fromPct * imgHeight). overflow:hidden
//   на container'е скрывает что вышло за границы.

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { brand, radius, typography } from '../../theme/brandV2';

const { width: SCREEN_W } = Dimensions.get('window');

const HERO_SLIDE_1 = require('../../../assets/onboarding/slide-1-hero.png');
const HERO_SLIDE_2 = require('../../../assets/onboarding/slide-2-driver-1.png');
const HERO_SLIDE_3 = require('../../../assets/onboarding/slide-2-driver-2.png');

// PNG native aspects.
const ASPECT_S1 = 853 / 1844;
const ASPECT_S2 = 941 / 1672;
const ASPECT_S3 = 853 / 1844;

// Окно отображения: [from, to] от высоты PNG. Подобрано чтобы:
//   - убрать сверху: status-bar + PNG-логотип «UrTruck» (рендерится
//     отдельно native, меньшим размером)
//   - убрать снизу: PNG-внутренние title/subtitle/dots/CTAs/оферта
//     (рендерятся native через i18n)
// Когда дизайнер пришлёт hero-only PNG (без UI): from=0, to=1.0.
// RC2 hero spacing fix (17 May): from-coords опущены, чтобы PNG-внутренний
// UrTruck-logo попадал в visible window целиком (раньше from=0.08-0.12
// обрезали верх логотипа). Status bar внутри PNG (~0-3%) всё ещё за
// крайней верхней границей окна.
const WINDOW_S1 = { from: 0.04, to: 0.50 };  // logo + карта + водитель + фура + склад
const WINDOW_S2 = { from: 0.03, to: 0.55 };  // logo + cargo card + bid cards + $-badge
const WINDOW_S3 = { from: 0.03, to: 0.50 };  // logo + driver + щит + driver-card + route bar

const HeroWindow = ({ source, imageAspect, win }) => {
  // SCREEN_W — фактическая ширина слайда (carousel pagingEnabled).
  // imgHeight = SCREEN_W / imageAspect — полная высота PNG при
  // отображении на всю ширину экрана.
  const imgHeight = SCREEN_W / imageAspect;
  const visiblePct = win.to - win.from;
  const containerHeight = imgHeight * visiblePct;
  const topOffset = -win.from * imgHeight;
  // pointerEvents="none" — иллюстрация декоративная, ни один её
  // подэлемент не должен intercept'ить tap'ы. Это страхует CTA-
  // кнопки снизу от любых RN-Web глюков с absolute-image над
  // overflow:hidden parent'ом (issue PR #35 → #36).
  return (
    <View
      pointerEvents="none"
      style={{
        width: '100%',
        height: containerHeight,
        overflow: 'hidden',
      }}
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

// SlideLogo (native compact) убран — текущие PNG уже содержат
// собственный UrTruck logo внутри hero illustration (после window-crop
// он остаётся видимым в верхней части). Native compact logo создавал
// duplicate. Когда дизайнер пришлёт hero-only PNG (без logo внутри),
// SlideLogo восстановится здесь.

const Slide = ({ source, imageAspect, win, title, subtitle }) => (
  <View style={s.slide}>
    <HeroWindow source={source} imageAspect={imageAspect} win={win} />
    <View style={s.captionBlock}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle} numberOfLines={3}>
        {subtitle}
      </Text>
    </View>
  </View>
);

export default function OnboardingV2Screen({ navigation }) {
  const { t } = useI18n();
  const { ensureGuest } = useAuth();
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(0);

  const onScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_W);
    if (next !== idx) setIdx(next);
  };

  const goPhone = () => {
    navigation.navigate('PhoneV2');
  };

  const goGuest = async () => {
    try {
      await ensureGuest();
    } catch {}
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { role: 'driver', guest: true } }],
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
            source={HERO_SLIDE_1}
            imageAspect={ASPECT_S1}
            win={WINDOW_S1}
            title={t('onb_v2_slide1_title')}
            subtitle={t('onb_v2_slide1_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_2}
            imageAspect={ASPECT_S2}
            win={WINDOW_S2}
            title={t('onb_v2_slide2_title')}
            subtitle={t('onb_v2_slide2_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_3}
            imageAspect={ASPECT_S3}
            win={WINDOW_S3}
            title={t('onb_v2_slide3_title')}
            subtitle={t('onb_v2_slide3_subtitle')}
          />
        </View>
      </ScrollView>

      {/* Paginator dots — dynamic */}
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

      {/* CTAs — native, единственная пара на экране.
          Pressable (вместо TouchableOpacity) даёт более надёжный
          tap handling на RN-Web. pressed-callback в style возвращает
          opacity 0.85 как visual feedback. zIndex/elevation на
          ctaWrap страхует от чего-либо absolutely-positioned поверх. */}
      <View style={s.ctaWrap} pointerEvents="box-none">
        <Pressable
          onPress={goPhone}
          accessibilityRole="button"
          accessibilityLabel={t('onb_v2_cta_phone')}
          testID="onb-v2-cta-phone"
          style={({ pressed }) => [
            s.ctaPrimary,
            { backgroundColor: brand.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={s.ctaPrimaryText}>{t('onb_v2_cta_phone')}</Text>
          <Feather name="arrow-right" size={20} color="#FFF" />
        </Pressable>
        <Pressable
          onPress={goGuest}
          accessibilityRole="button"
          accessibilityLabel={t('onb_v2_cta_guest')}
          testID="onb-v2-cta-guest"
          style={({ pressed }) => [
            s.ctaOutline,
            pressed && { opacity: 0.85 },
          ]}
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
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 0,
    // RC2 hero spacing fix (17 May): paddingTop сдвигает hero block
    // вниз от реального iOS status bar — даёт breathing room сверху.
    // PNG-внутренний логотип (теперь в visible window) не прилипает
    // к notch'у. justifyContent='flex-start' оставляем дефолтным,
    // чтобы illustration шла сразу после padding'а, а captionBlock
    // снизу натурально следует за высотой HeroWindow.
    // RC2 nudge-up (17 May): 16 → 6 по owner-фидбеку (hero был чуть
    // слишком низко, оставалась пустая дырка сверху). 6pt — минимум
    // breathing room от safe-area без визуального gap.
    paddingTop: 6,
    alignItems: 'stretch',
  },
  // slideLogo style удалён вместе с SlideLogo компонентом (см. JSX выше).
  captionBlock: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    zIndex: 5,
    elevation: 5,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  // ctaWrap явно поднят над всем остальным: zIndex/elevation страхуют
  // от любых absolute-overlay'ев слева от карусели. backgroundColor
  // = brand.bg делает блок «непрозрачным» — если что-то под ним
  // утечёт, оно не будет видно и не сможет получить tap.
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
    backgroundColor: brand.bg,
    zIndex: 10,
    elevation: 10,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
    flex: 1,
    textAlign: 'center',
  },
  ctaOutline: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 8,
    borderWidth: 1,
    borderColor: brand.borderStrong,
    backgroundColor: brand.surface,
  },
  ctaOutlineText: {
    ...typography.button,
    color: brand.textPrimary,
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  consent: {
    fontSize: 12,
    color: brand.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  consentLink: {
    color: brand.textPrimary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
