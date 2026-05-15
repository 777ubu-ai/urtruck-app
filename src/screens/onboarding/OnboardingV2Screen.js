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
  TouchableOpacity,
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
const WINDOW_S1 = { from: 0.12, to: 0.50 };  // карта + водитель + фура + склад
const WINDOW_S2 = { from: 0.08, to: 0.55 };  // cargo card + bid cards + $-badge
const WINDOW_S3 = { from: 0.08, to: 0.50 };  // driver + щит + driver-card + route bar

const HeroWindow = ({ source, imageAspect, win }) => {
  // SCREEN_W — фактическая ширина слайда (carousel pagingEnabled).
  // imgHeight = SCREEN_W / imageAspect — полная высота PNG при
  // отображении на всю ширину экрана.
  const imgHeight = SCREEN_W / imageAspect;
  const visiblePct = win.to - win.from;
  const containerHeight = imgHeight * visiblePct;
  const topOffset = -win.from * imgHeight;
  return (
    <View
      style={{
        width: '100%',
        height: containerHeight,
        overflow: 'hidden',
      }}
    >
      <Image
        source={source}
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

const SlideLogo = () => (
  <Text style={s.slideLogo}>
    <Text style={{ color: brand.logoDark }}>Ur</Text>
    <Text style={{ color: brand.logoAccent }}>Truck</Text>
  </Text>
);

const Slide = ({ source, imageAspect, win, title, subtitle }) => (
  <View style={s.slide}>
    <SlideLogo />
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

      {/* CTAs — native, единственная пара на экране */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          onPress={goPhone}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('onb_v2_cta_phone')}
          testID="onb-v2-cta-phone"
          style={[s.ctaPrimary, { backgroundColor: brand.primary }]}
        >
          <Text style={s.ctaPrimaryText}>{t('onb_v2_cta_phone')}</Text>
          <Feather name="arrow-right" size={20} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goGuest}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('onb_v2_cta_guest')}
          testID="onb-v2-cta-guest"
          style={s.ctaOutline}
        >
          <Feather name="package" size={18} color={brand.textPrimary} />
          <Text style={s.ctaOutlineText}>{t('onb_v2_cta_guest')}</Text>
          <Feather name="arrow-right" size={18} color={brand.textPrimary} />
        </TouchableOpacity>

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
    alignItems: 'stretch',
  },
  slideLogo: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },
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
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
    backgroundColor: brand.bg,
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
