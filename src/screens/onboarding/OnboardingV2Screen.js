// OnboardingV2Screen — inDrive-style welcome с 3 слайдами карусели.
//
// Stage RC2-png-integration:
//   3 reference-screenshots (PNG) от owner'а используются как top-half
//   illustration в каждом слайде. Это full-screen иллюстрации (water-water
//   до title), нижняя часть PNG (где title/subtitle/CTAs/paginator самого
//   screenshot'а) обрезается через top-anchored crop. Под illustration —
//   native UI: title/subtitle через i18n + paginator dots + 2 CTAs.
//
//   Source PNGs (тип-fyi: JPEG с .png-расширением, Metro толерантен):
//     slide-1-hero.png      — «Прямые рейсы» (водитель + карта + фура)
//     slide-2-driver-1.png  — «Честные ставки» (cargo card + bid cards,
//                              с ценами $4 800 / $4 200 в illustration)
//     slide-2-driver-2.png  — «Проверенные участники» (driver + shield +
//                              driver-card + route bar)
//
// CTA фиксирован под всеми слайдами:
//   1) «Продолжить по номеру» — основная зелёная кнопка → PhoneV2
//   2) «Смотреть грузы» — outline secondary → guest-вход в Main

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

// Source PNGs. require() резолвится Metro статически — пути относительные
// от этого файла.
const HERO_SLIDE_1 = require('../../../assets/onboarding/slide-1-hero.png');
const HERO_SLIDE_2 = require('../../../assets/onboarding/slide-2-driver-1.png');
const HERO_SLIDE_3 = require('../../../assets/onboarding/slide-2-driver-2.png');

// Top-anchored crop: показываем верхнюю ~50% PNG. PNG aspect ~0.46-0.56,
// контейнер aspect ~0.92 — изображение растянуто по ширине, обрезано снизу.
// Container holds full PNG width; PNG height = width / pngAspect; container
// height = width / 0.92, что меньше PNG height, → нижняя половина PNG за
// пределами container и не видна.
const HeroCrop = ({ source }) => (
  <View style={s.heroCropBox}>
    <Image source={source} style={s.heroCropImage} resizeMode="cover" />
  </View>
);

const Slide = ({ source, title, subtitle }) => (
  <View style={s.slide}>
    <HeroCrop source={source} />
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
            title={t('onb_v2_slide1_title')}
            subtitle={t('onb_v2_slide1_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_2}
            title={t('onb_v2_slide2_title')}
            subtitle={t('onb_v2_slide2_subtitle')}
          />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_3}
            title={t('onb_v2_slide3_title')}
            subtitle={t('onb_v2_slide3_subtitle')}
          />
        </View>
      </ScrollView>

      {/* Paginator dots — фиксированы под слайдом, до CTA */}
      <View style={s.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              s.dot,
              i === idx
                ? { backgroundColor: brand.routeGreen, width: 22, height: 6, borderRadius: 3 }
                : { backgroundColor: brand.borderStrong },
            ]}
          />
        ))}
      </View>

      {/* CTAs */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          onPress={goPhone}
          activeOpacity={0.9}
          accessibilityRole="button"
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

// Подобрано визуально под source PNG (~853-941 × 1672-1844). Top-anchored
// crop оставляет верхние ~55% PNG (illustration + UrTruck logo), нижние
// ~45% (title/CTAs/paginator из самого screenshot'а) обрезаются.
const HERO_BOX_ASPECT = 0.78;       // ширина / высота контейнера
const HERO_IMG_ASPECT = 853 / 1844; // ширина / высота source PNG (~0.46)

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
  heroCropBox: {
    width: '100%',
    aspectRatio: HERO_BOX_ASPECT,
    overflow: 'hidden',
    backgroundColor: brand.bg,
  },
  heroCropImage: {
    width: '100%',
    aspectRatio: HERO_IMG_ASPECT,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  captionBlock: {
    paddingHorizontal: 24,
    paddingTop: 12,
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
    marginBottom: 8,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  // CTA
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
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
