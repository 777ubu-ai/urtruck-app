// OnboardingV2Screen — inDrive-style welcome с 3 слайдами карусели.
//
// Stage RC2-png-no-crop (14 May):
//   PNG-ассеты от owner'а — это **full-screen** screenshots, не extracted
//   illustrations. Они уже содержат UrTruck logo + title + subtitle +
//   paginator dots в самом PNG. Ранее (Stage RC2-png-integration) мы
//   обрезали нижнюю половину PNG через top-anchored crop, но это резало
//   важные части иллюстрации (низ карточки груза, ноги водителя).
//
//   Новый layout:
//     - PNG показывается **целиком** через resizeMode='contain' в
//       контейнере с PNG-native aspectRatio. Никаких overflow:hidden.
//     - Native title/subtitle/paginator из PNG используются как есть
//       (часть screenshot'а). Мой собственный native title/subtitle
//       UDALEN — это дублировало то, что уже в PNG.
//     - Реальные tap-target CTAs ("Продолжить по номеру" / "Смотреть
//       грузы") рисуются НИЖЕ PNG нативно — на PNG их рисунок виден
//       внутри illustration, но они нерабочие; настоящие интерактивные
//       кнопки идут под ним.
//     - Width PNG = 80% screen чтобы влезть с native CTAs снизу
//       на iPhone 14 Pro без скролла. На widescreen iPad PNG не
//       растягивается выше своей native пропорции (resizeMode='contain').
//
//   Slide 3 subtitle conflict:
//     Внутри PNG slide-2-driver-2.png жёсткое «Все водители и
//     грузоотправители проходят...». Owner запросил мягкое «Участники
//     проходят проверку перед работой с грузами». Закрываем старый
//     subtitle белым overlay + native Text с новой формулировкой.

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

// Source PNGs.
const HERO_SLIDE_1 = require('../../../assets/onboarding/slide-1-hero.png');
const HERO_SLIDE_2 = require('../../../assets/onboarding/slide-2-driver-1.png');
const HERO_SLIDE_3 = require('../../../assets/onboarding/slide-2-driver-2.png');

// Aspect ratios source PNG (file).
const ASPECT_SLIDE_1 = 853 / 1844;   // ≈ 0.463
const ASPECT_SLIDE_2 = 941 / 1672;   // ≈ 0.563
const ASPECT_SLIDE_3 = 853 / 1844;   // ≈ 0.463

// На slide 3 поверх PNG-subtitle ("Все водители и грузоотправители
// проходят...") кладём white overlay с новой формулировкой owner'а
// "Участники проходят проверку перед работой с грузами". Координаты
// взяты от высоты PNG (1844 px native) и переведены в % от высоты
// container'а (PNG занимает height = width / aspectRatio).
//   subtitle area in slide-3 PNG: y ~ 60%..68% of PNG height
// Overlay блок чуть шире (58%..70%) на запас.
const SLIDE_3_SUBTITLE_TOP_PCT = 0.58;
const SLIDE_3_SUBTITLE_HEIGHT_PCT = 0.12;

const Slide = ({ source, aspectRatio, overlay = null }) => (
  <View style={s.slide}>
    <View style={[s.heroBox, { aspectRatio }]}>
      <Image source={source} style={s.heroImg} resizeMode="contain" />
      {overlay}
    </View>
  </View>
);

const Slide3SubtitleOverlay = ({ t }) => (
  <View
    pointerEvents="none"
    style={[
      s.overlayBox,
      {
        top: `${SLIDE_3_SUBTITLE_TOP_PCT * 100}%`,
        height: `${SLIDE_3_SUBTITLE_HEIGHT_PCT * 100}%`,
      },
    ]}
  >
    <Text style={s.overlayText} numberOfLines={3}>
      {t('onb_v2_slide3_subtitle')}
    </Text>
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
          <Slide source={HERO_SLIDE_1} aspectRatio={ASPECT_SLIDE_1} />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide source={HERO_SLIDE_2} aspectRatio={ASPECT_SLIDE_2} />
        </View>
        <View style={{ width: SCREEN_W }}>
          <Slide
            source={HERO_SLIDE_3}
            aspectRatio={ASPECT_SLIDE_3}
            overlay={<Slide3SubtitleOverlay t={t} />}
          />
        </View>
      </ScrollView>

      {/* CTAs — реальные tap-target поверх PNG-нарисованных. */}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  // PNG-container: ширина 80% screen, aspectRatio задаёт высоту,
  // resizeMode='contain' в Image сохраняет картинку без растяжения.
  heroBox: {
    width: '80%',
    maxHeight: '100%',
    alignSelf: 'center',
    overflow: 'visible',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  // Overlay для slide 3 subtitle — белый прямоугольник на всю ширину
  // heroBox в области старого subtitle.
  overlayBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  overlayText: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  // CTAs стандартные.
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
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
});
