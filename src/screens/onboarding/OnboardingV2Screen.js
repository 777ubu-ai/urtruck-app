// OnboardingV2Screen — inDrive-style welcome с 3 слайдами карусели.
//
// Stage RC2-no-duplicate-cta (15 May):
//   PNG-ассеты от owner'а — full-screen screenshots с уже отрисованным
//   UI (logo + title + subtitle + paginator + кнопки + оферта). Если
//   показывать PNG целиком + рендерить свои native CTAs — получается
//   ДУБЛЯЖ кнопок на экране.
//
//   Временное решение (до финальных hero-only PNG от дизайнера):
//     - PNG **кропается** до верхней hero-части через top-anchored
//       overflow:hidden + image position:absolute top:0. Per-slide
//       coordinated crop ratio: slide 1 — 50%, slide 2 — 62%, slide 3
//       — 55% от высоты PNG. Это убирает встроенные кнопки/dots/
//       оферту из видимой части.
//     - Native UI restored: title/subtitle через i18n, paginator dots
//       (dynamic active state), 2 CTAs (real tap), consent. Это
//       единственные интерактивные элементы на экране.
//     - UrTruck logo внутри hero-части PNG остаётся видимым как часть
//       brand-illustration — он не дублирует ничего на этом экране.
//
//   Финальное решение (TODO): owner пришлёт hero-only PNG (только
//   illustration, без logo/title/CTAs внутри). Тогда уберём crop и
//   восстановим native UrTruck-logo сверху.

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

// Source PNGs (с встроенным UI — кропаются ниже).
const HERO_SLIDE_1 = require('../../../assets/onboarding/slide-1-hero.png');
const HERO_SLIDE_2 = require('../../../assets/onboarding/slide-2-driver-1.png');
const HERO_SLIDE_3 = require('../../../assets/onboarding/slide-2-driver-2.png');

// Native PNG aspect ratios (width/height из файла).
const ASPECT_S1 = 853 / 1844;   // ≈ 0.463
const ASPECT_S2 = 941 / 1672;   // ≈ 0.563
const ASPECT_S3 = 853 / 1844;   // ≈ 0.463

// Crop ratio (доля PNG-высоты, которую показываем сверху).
// Подобрано визуально, чтобы НЕ попасть на встроенные title/subtitle/
// dots/CTAs/оферту screenshot'а. Если PNG обновятся (hero-only) —
// поставить 1.0 и убрать crop.
const CROP_S1 = 0.50;
const CROP_S2 = 0.62;
const CROP_S3 = 0.55;

// containerAspect = imageAspect / cropPct. Если cropPct < 1.0, container
// уже PNG → image overflow по высоте, нижняя часть скрыта overflow:hidden.
const HeroCrop = ({ source, imageAspect, cropPct }) => {
  const containerAspect = imageAspect / cropPct;
  return (
    <View style={[s.heroBox, { aspectRatio: containerAspect }]}>
      <Image
        source={source}
        style={[s.heroImg, { aspectRatio: imageAspect }]}
      />
    </View>
  );
};

const Slide = ({ source, imageAspect, cropPct, title, subtitle }) => (
  <View style={s.slide}>
    <HeroCrop source={source} imageAspect={imageAspect} cropPct={cropPct} />
    <View style={s.captionBlock}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>
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
        contentContainerStyle={{ alignItems: 'stretch' }}
      >
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_1}
            imageAspect={ASPECT_S1}
            cropPct={CROP_S1}
            title={t('onb_v2_slide1_title')}
            subtitle={t('onb_v2_slide1_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_2}
            imageAspect={ASPECT_S2}
            cropPct={CROP_S2}
            title={t('onb_v2_slide2_title')}
            subtitle={t('onb_v2_slide2_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_3}
            imageAspect={ASPECT_S3}
            cropPct={CROP_S3}
            title={t('onb_v2_slide3_title')}
            subtitle={t('onb_v2_slide3_subtitle')}
          />
        </View>
      </ScrollView>

      {/* Paginator — dynamic active dot */}
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

      {/* CTAs — native, реальные tap-target. Единственные на экране. */}
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
  // Crop box — width:100%, aspectRatio задаёт высоту (меньше native
  // PNG-aspect = nижняя часть PNG за пределами box, overflow:hidden
  // её скрывает).
  heroBox: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: brand.bg,
  },
  // Image — top-anchored, width:100%, aspectRatio задаёт высоту image
  // равной полной высоте PNG (которая больше высоты heroBox).
  heroImg: {
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  captionBlock: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 6,
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
    paddingHorizontal: 8,
  },
  // Paginator
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  // CTAs (одна пара на экране!)
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
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
    marginTop: 10,
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
    marginTop: 12,
  },
  consentLink: {
    color: brand.textPrimary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
