// OnboardingV2Screen — inDrive-style welcome с 3 слайдами карусели.
//
// Owner ТЗ от 2026-05-13:
//   Слайд 1 — "Прямые рейсы / Китай ↔ СНГ без посредников" + иллюстрация
//             фуры на карте.
//   Слайд 2 — "Честные ставки / Водители предлагают цену, вы выбираете
//             лучшее предложение" + карточка-груз с двумя офферами.
//   Слайд 3 — "Проверенные участники / Все водители и грузоотправители
//             проходят проверку документов и транспорта" + driver-card
//             с verified-чекмарками.
//
// CTA фиксирован под всеми слайдами:
//   1) "Продолжить по номеру" — основная зелёная кнопка → PhoneV2
//   2) "Смотреть грузы" — outline secondary → guest-вход в Main
//
// Иллюстрации — простые композиции на Feather outline icons и
// геометрических примитивах. Сложные PNG из макета (рисованный водитель)
// требуют ассетов от дизайнера; на данном этапе делаем семантически
// эквивалентные блоки в фирменных цветах (brandV2.routeOrange/routeGreen).

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { brand, radius, space, typography } from '../../theme/brandV2';

const { width: SCREEN_W } = Dimensions.get('window');

// Логотип "Ur" navy + "Truck" orange — повторяется на всех 3 слайдах.
const Logo = () => (
  <Text style={s.logo}>
    <Text style={{ color: brand.logoDark }}>Ur</Text>
    <Text style={{ color: brand.logoAccent }}>Truck</Text>
  </Text>
);

// ─── Slide 1: прямые рейсы ─────────────────────────────────────────
const Slide1 = ({ t }) => (
  <View style={s.slide}>
    <Logo />
    <View style={s.illoBox}>
      {/* Карта-фон: серая зона + два point-маркера + route-линия */}
      <View style={s.mapWrap}>
        <View style={s.routeRow}>
          <View style={s.pointDark} />
          <Text style={s.pointLabelLeft}>Китай</Text>
          <View style={[s.routeLine, { backgroundColor: brand.routeOrange }]} />
          <View style={[s.pointMarker, { backgroundColor: brand.routeGreen }]}>
            <Feather name="map-pin" size={12} color="#FFF" />
          </View>
          <Text style={s.pointLabelMid}>Казахстан</Text>
          <View style={[s.routeLine, { backgroundColor: brand.routeOrange }]} />
          <View style={[s.pointMarker, { backgroundColor: brand.textPrimary }]}>
            <Feather name="map-pin" size={12} color="#FFF" />
          </View>
          <Text style={s.pointLabelRight}>СНГ</Text>
        </View>
      </View>
      <View style={s.heroIconCircle}>
        <Feather name="truck" size={56} color={brand.textPrimary} />
      </View>
    </View>
    <Text style={s.title}>{t('onb_v2_slide1_title')}</Text>
    <Text style={s.subtitle}>{t('onb_v2_slide1_subtitle')}</Text>
  </View>
);

// ─── Slide 2: честные ставки ────────────────────────────────────────
const Slide2 = ({ t }) => (
  <View style={s.slide}>
    <Logo />
    <View style={s.illoBox}>
      <View style={s.bidsRow}>
        <View style={s.bidCardLeft}>
          <View style={s.avatarCircleMuted}>
            <Feather name="user" size={20} color={brand.textPrimary} />
          </View>
          <Text style={s.bidName}>{t('onb_v2_bid_driver1')}</Text>
          <Text style={s.bidPrice}>$4 800</Text>
          <Text style={s.bidLabel}>{t('onb_v2_bid_offer')}</Text>
        </View>
        <View style={s.cargoCard}>
          <View style={s.cargoIconCircle}>
            <Feather name="package" size={22} color={brand.routeGreen} />
          </View>
          <Text style={s.cargoSize}>20 т, 82 м³</Text>
          <Text style={s.cargoCaption}>{t('onb_v2_cargo_label')}</Text>
          <View style={s.cargoRouteRow}>
            <Feather name="map-pin" size={12} color={brand.textPrimary} />
            <Text style={s.cargoRouteCity}>Китай</Text>
            <View style={s.cargoDash} />
            <Feather name="map-pin" size={12} color={brand.accent} />
            <Text style={s.cargoRouteCity}>Хоргос</Text>
            <View style={s.cargoDash} />
            <Feather name="map-pin" size={12} color={brand.routeGreen} />
            <Text style={s.cargoRouteCity}>Москва</Text>
          </View>
          <View style={s.cargoMetaRow}>
            <Feather name="calendar" size={12} color={brand.textSecondary} />
            <Text style={s.cargoMetaText}>18 мая</Text>
            <Feather name="truck" size={12} color={brand.textSecondary} style={{ marginLeft: 8 }} />
            <Text style={s.cargoMetaText}>FTL</Text>
          </View>
        </View>
        <View style={s.bidCardRight}>
          <View style={[s.avatarCircleAccent, { backgroundColor: brand.routeGreen }]}>
            <Feather name="user" size={20} color="#FFF" />
          </View>
          <Text style={s.bidName}>{t('onb_v2_bid_driver2')}</Text>
          <Text style={[s.bidPrice, { color: brand.routeGreen }]}>$4 200</Text>
          <Text style={s.bidLabel}>{t('onb_v2_bid_offer')}</Text>
        </View>
      </View>
      <View style={s.dollarBadge}>
        <Text style={s.dollarBadgeText}>$</Text>
      </View>
    </View>
    <Text style={s.title}>{t('onb_v2_slide2_title')}</Text>
    <Text style={s.subtitle}>{t('onb_v2_slide2_subtitle')}</Text>
  </View>
);

// ─── Slide 3: проверенные участники ────────────────────────────────
const Slide3 = ({ t }) => (
  <View style={s.slide}>
    <Logo />
    <View style={s.illoBox}>
      <View style={s.verifyCard}>
        <View style={s.verifyHeader}>
          <View style={[s.avatarCircleAccent, { backgroundColor: brand.routeGreen }]}>
            <Feather name="user" size={22} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.verifyNameRow}>
              <Text style={s.verifyName}>{t('onb_v2_verified_driver')}</Text>
              <Feather name="check-circle" size={14} color={brand.routeGreen} style={{ marginLeft: 4 }} />
            </View>
            <Text style={s.verifySubtitle}>{t('onb_v2_verified_label')}</Text>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Feather key={i} name="star" size={11} color={brand.accent} />
              ))}
              <Text style={s.starsValue}>  4.8</Text>
            </View>
          </View>
          <Feather name="check-circle" size={20} color={brand.routeGreen} />
        </View>
        <View style={s.verifyDivider} />
        {[
          { icon: 'file-text', label: t('onb_v2_check_docs'), state: t('onb_v2_check_done') },
          { icon: 'truck', label: t('onb_v2_check_vehicle'), state: t('onb_v2_check_done') },
          { icon: 'shield', label: t('onb_v2_check_insurance'), state: t('onb_v2_check_active') },
          { icon: 'clock', label: t('onb_v2_check_history'), state: t('onb_v2_check_excellent') },
        ].map((row) => (
          <View key={row.icon} style={s.verifyRow}>
            <Feather name={row.icon} size={14} color={brand.textSecondary} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.verifyRowLabel}>{row.label}</Text>
              <Text style={s.verifyRowState}>{row.state}</Text>
            </View>
            <Feather name="check-circle" size={14} color={brand.routeGreen} />
          </View>
        ))}
      </View>
      <View style={s.featureChipsRow}>
        {[
          { icon: 'shield', label: t('onb_v2_feature_docs') },
          { icon: 'star', label: t('onb_v2_feature_rating') },
          { icon: 'briefcase', label: t('onb_v2_feature_deals') },
        ].map((c) => (
          <View key={c.icon} style={s.featureChip}>
            <View style={s.featureIconCircle}>
              <Feather name={c.icon} size={18} color={brand.routeGreen} />
            </View>
            <Text style={s.featureChipLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
    <Text style={s.title}>{t('onb_v2_slide3_title')}</Text>
    <Text style={s.subtitle}>{t('onb_v2_slide3_subtitle')}</Text>
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
        <View style={{ width: SCREEN_W }}><Slide1 t={t} /></View>
        <View style={{ width: SCREEN_W }}><Slide2 t={t} /></View>
        <View style={{ width: SCREEN_W }}><Slide3 t={t} /></View>
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

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  illoBox: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: brand.surfaceSoft,
    borderRadius: radius.xl,
    marginTop: 12,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  // Slide 1 illustration bits
  mapWrap: {
    position: 'absolute',
    top: '28%',
    left: 12,
    right: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  pointDark: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: brand.textPrimary,
  },
  pointMarker: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  routeLine: {
    flex: 1, height: 2, marginHorizontal: 4, opacity: 0.5,
  },
  pointLabelLeft: {
    position: 'absolute', left: 10, top: 14,
    color: brand.textPrimary, fontSize: 12, fontWeight: '700',
  },
  pointLabelMid: {
    position: 'absolute', left: '38%', top: -16,
    color: brand.textPrimary, fontSize: 12, fontWeight: '700',
  },
  pointLabelRight: {
    position: 'absolute', right: 8, top: 14,
    color: brand.textPrimary, fontSize: 12, fontWeight: '700',
  },
  heroIconCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: brand.bg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: brand.border,
    marginTop: 24,
  },
  // Slide 2 illustration bits
  bidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 6,
  },
  bidCardLeft: {
    flex: 0.9,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1, borderColor: brand.border,
  },
  bidCardRight: {
    flex: 0.9,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    padding: 10,
    alignItems: 'center',
    borderWidth: 2, borderColor: brand.routeGreen,
  },
  cargoCard: {
    flex: 1.4,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1, borderColor: brand.border,
  },
  avatarCircleMuted: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: brand.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  avatarCircleAccent: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  bidName: {
    fontSize: 11, fontWeight: '700', color: brand.textPrimary,
  },
  bidPrice: {
    fontSize: 14, fontWeight: '900', color: brand.textPrimary,
    marginTop: 4,
  },
  bidLabel: {
    fontSize: 9, color: brand.textSecondary, marginTop: 2,
  },
  cargoIconCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: brand.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  cargoSize: {
    fontSize: 14, fontWeight: '900', color: brand.textPrimary,
  },
  cargoCaption: {
    fontSize: 10, color: brand.textSecondary, marginBottom: 6,
  },
  cargoRouteRow: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 4,
  },
  cargoRouteCity: {
    fontSize: 8, color: brand.textPrimary, marginHorizontal: 1,
    fontWeight: '600',
  },
  cargoDash: {
    width: 6, height: 1, backgroundColor: brand.borderStrong,
    marginHorizontal: 2,
  },
  cargoMetaRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 4,
  },
  cargoMetaText: {
    fontSize: 9, color: brand.textSecondary, marginLeft: 2,
  },
  dollarBadge: {
    position: 'absolute',
    bottom: 18,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: brand.bg,
    borderWidth: 2, borderColor: brand.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  dollarBadgeText: {
    fontSize: 18, fontWeight: '900', color: brand.accent,
  },
  // Slide 3 illustration bits
  verifyCard: {
    width: '92%',
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1, borderColor: brand.border,
  },
  verifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifyNameRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  verifyName: {
    fontSize: 13, fontWeight: '800', color: brand.textPrimary,
  },
  verifySubtitle: {
    fontSize: 10, color: brand.textSecondary, marginTop: 1,
  },
  starsRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4,
  },
  starsValue: {
    fontSize: 11, fontWeight: '800', color: brand.textPrimary,
  },
  verifyDivider: {
    height: 1, backgroundColor: brand.divider,
    marginVertical: 10,
  },
  verifyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4,
  },
  verifyRowLabel: {
    fontSize: 11, fontWeight: '700', color: brand.textPrimary,
  },
  verifyRowState: {
    fontSize: 9, color: brand.textSecondary,
  },
  featureChipsRow: {
    flexDirection: 'row',
    width: '92%',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  featureChip: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: 4,
  },
  featureIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: brand.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  featureChipLabel: {
    fontSize: 10, color: brand.textSecondary,
    textAlign: 'center', fontWeight: '600',
  },
  // Shared text
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
