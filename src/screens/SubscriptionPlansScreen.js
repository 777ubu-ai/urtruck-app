// SubscriptionPlansScreen — страница тарифов с месячным лимитом принятия
// сделок (Free: 5/мес, Pro: 30/мес). Источник правды о лимите и статусе
// подписки — сервер (subscriptionAPI.status, поле deal_accept); этот экран
// только показывает состояние и запускает покупку Pro через react-native-iap
// (тот же продукт и IAP-поток, что и в SubscriptionScreen).
//
// Веб не продаёт подписку (Google Play Billing — Android-only) — на web
// вместо CTA показываем пояснение и не трогаем нативный IAP-модуль вовсе.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { useToast } from '../components/Toast';
import { subscriptionAPI } from '../utils/subscription';
import { IS_BETA } from '../config/env';
import BrandHeader from '../components/ui/v1/BrandHeader';
import GlassCard from '../components/ui/v1/GlassCard';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import Feather from '@expo/vector-icons/Feather';

// react-native-iap — нативный модуль, на web не поддержан. Динамический
// require под Platform-гейтом, чтобы веб-бандл вообще не трогал его.
let RNIap = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line global-require
  RNIap = require('react-native-iap');
}

const FREE_DEAL_LIMIT = 5;

export default function SubscriptionPlansScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const role = route?.params?.role;
  const accent = role === 'driver' ? v1.driver : v1.cargoOwner;

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadStatus = useCallback(async () => {
    const r = await subscriptionAPI.status();
    if (!mountedRef.current) return;
    if (r.ok) {
      setStatus(r);
      setLoadError(false);
    } else {
      // Ошибка сети ≠ «подписки нет»: показываем состояние ошибки с retry,
      // а не тарифы как будто active=false подтверждён сервером.
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // IAP connection + слушатели покупок — только на нативных платформах.
  // Поток тот же, что в SubscriptionScreen: purchaseUpdatedListener →
  // верификация на сервере → finishTransaction → refetch статуса.
  useEffect(() => {
    if (!RNIap) return undefined;
    let purchaseSub;
    let errorSub;
    (async () => {
      try {
        await RNIap.initConnection();
        if (Platform.OS === 'android') {
          await RNIap.flushFailedPurchasesCachedAsPendingAndroid().catch(() => {});
        }
      } catch {
        // соединение с Google Play недоступно — экран остаётся рабочим,
        // кнопка покупки просто ошибётся
      }
      purchaseSub = RNIap.purchaseUpdatedListener(async (purchase) => {
        const token = purchase?.purchaseToken;
        const productId = purchase?.productId;
        if (!token || !productId) return;
        const verify = await subscriptionAPI.verifyGooglePurchase(productId, token);
        try {
          await RNIap.finishTransaction({ purchase, isConsumable: false });
        } catch {}
        if (!mountedRef.current) return;
        setPurchasing(false);
        if (verify.ok && verify.active) {
          toast(t('subscription_purchase_success'));
          loadStatus();
        } else {
          toast(t('subscription_verify_failed'));
        }
      });
      errorSub = RNIap.purchaseErrorListener((err) => {
        if (!mountedRef.current) return;
        setPurchasing(false);
        // E_USER_CANCELLED — обычный отказ пользователя, без тоста-ошибки.
        if (err?.code !== 'E_USER_CANCELLED') {
          toast(t('subscription_purchase_error'));
        }
      });
    })();
    return () => {
      purchaseSub?.remove?.();
      errorSub?.remove?.();
      RNIap.endConnection?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBuy = useCallback(async () => {
    if (!RNIap || !status?.google_product_id) return;
    setPurchasing(true);
    try {
      const productId = status.google_product_id;
      let request = { sku: productId };
      if (Platform.OS === 'android') {
        // Google Play Billing 5+: покупка подписки требует offerToken
        // выбранного базового плана — берём первый оффер из каталога.
        const subs = await RNIap.getSubscriptions({ skus: [productId] });
        const offerToken = subs?.[0]?.subscriptionOfferDetails?.[0]?.offerToken;
        if (offerToken) {
          request = { subscriptionOffers: [{ sku: productId, offerToken }] };
        }
      }
      await RNIap.requestSubscription(request);
    } catch {
      setPurchasing(false);
      toast(t('subscription_purchase_error'));
    }
  }, [status?.google_product_id, toast, t]);

  // Активная серверная подписка = тариф Pro. Лимит сделок маппится в
  // subscriptionAPI.status (deal_accept) — старый бэкенд без deal_accept
  // получает fallback used=0, limit=5 там же.
  const isActive = !!status?.active;
  const dealUsed = status?.deal_accept?.used ?? 0;
  const dealLimit = status?.deal_accept?.limit ?? FREE_DEAL_LIMIT;
  const canAccept = status?.deal_accept?.can_accept !== false;
  const progress = dealLimit > 0 ? Math.min(100, Math.round((dealUsed / dealLimit) * 100)) : 0;
  // Пилот (IS_BETA) + серверная монетизация выключена — покупку не показываем.
  const isPilotFree = IS_BETA && !!status && !status.monetization_enabled;
  const showBuy = !isActive && !isPilotFree && Platform.OS !== 'web';

  const formatPeriodEnd = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const locale = lang === 'ZH' ? 'zh-CN' : lang === 'EN' ? 'en-GB' : lang === 'KK' ? 'kk-KZ' : 'ru-RU';
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const CurrentBadge = () => (
    <View style={[s.badge, { borderColor: accent }]}>
      <Text style={[s.badgeText, { color: accent }]}>{t('plans_current_badge')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent} compact />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[s.title, { color: v1.text }]}>{t('plans_title')}</Text>
        <Text style={[s.subtitle, { color: v1.textMuted }]}>{t('plans_subtitle')}</Text>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={v1.textMuted} /></View>
        ) : loadError ? (
          <View style={s.center}>
            <Feather name="wifi-off" size={28} color={v1.textMuted} />
            <Text style={[s.errorText, { color: v1.textMuted }]}>{t('plans_load_error')}</Text>
            <TouchableOpacity
              style={[s.retryBtn, { borderColor: accent }]}
              onPress={() => { setLoading(true); setLoadError(false); loadStatus(); }}
              testID="plans-retry-button"
            >
              <Text style={[s.retryBtnText, { color: accent }]}>{t('subscription_retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.body}>
            {/* Карточка текущего лимита принятия сделок */}
            <GlassCard>
              <View style={s.limitRow}>
                <Feather name="briefcase" size={18} color={canAccept ? accent : '#EF4444'} />
                <Text style={[s.limitTitle, { color: v1.text }]}>
                  {(t('plans_usage') || '').replace('{used}', String(dealUsed)).replace('{limit}', String(dealLimit))}
                </Text>
                <Text style={[s.limitPeriod, { color: v1.textMuted }]}>{t('plans_usage_period')}</Text>
              </View>
              <View style={[s.track, { backgroundColor: v1.bgDeep }]}>
                <View style={[s.fill, { backgroundColor: canAccept ? accent : '#EF4444', width: `${progress}%` }]} />
              </View>
              <Text style={[s.resetHint, { color: v1.textMuted }]}>{t('plans_reset_hint')}</Text>
              {!canAccept && (
                <View style={[s.exhausted, { borderColor: '#EF4444', backgroundColor: v1.bgDeep }]}>
                  <Feather name="alert-circle" size={18} color="#EF4444" />
                  <Text style={[s.exhaustedTitle, { color: '#EF4444' }]}>{t('plans_limit_exhausted')}</Text>
                  <Text style={[s.exhaustedHint, { color: v1.textMuted }]}>{t('plans_limit_exhausted_hint')}</Text>
                </View>
              )}
            </GlassCard>

            {/* Тариф Free */}
            <GlassCard>
              <View style={s.planRow}>
                <Text style={[s.planName, { color: v1.text }]}>{t('plans_free_name')}</Text>
                {!isActive && <CurrentBadge />}
              </View>
              <Text style={[s.planDesc, { color: v1.textMuted }]}>{t('plans_free_desc')}</Text>
            </GlassCard>

            {/* Тариф Pro */}
            <GlassCard accent={accent} style={s.proCard}>
              <View style={s.planRow}>
                <Text style={[s.planName, { color: v1.text }]}>{t('plans_pro_name')}</Text>
                {isActive && <CurrentBadge />}
              </View>
              <Text style={[s.planDesc, { color: v1.textMuted }]}>{t('plans_pro_desc')}</Text>
              <View style={s.features}>
                <View style={s.featureRow}>
                  <Feather name="check" size={16} color={accent} />
                  <Text style={[s.featureText, { color: v1.text }]}>{t('plans_pro_feature_deals')}</Text>
                </View>
                <View style={s.featureRow}>
                  <Feather name="check" size={16} color={accent} />
                  <Text style={[s.featureText, { color: v1.text }]}>{t('plans_pro_feature_contacts')}</Text>
                </View>
              </View>
            </GlassCard>

            {isActive && !!status?.period_end && (
              <View style={[s.activeNote, { borderColor: accent, backgroundColor: v1.surface }]}>
                <Feather name="zap" size={18} color={accent} />
                <Text style={[s.activeNoteText, { color: v1.text }]}>
                  {(t('plans_active_until') || '').replace('{date}', formatPeriodEnd(status.period_end))}
                </Text>
              </View>
            )}

            {isPilotFree ? (
              <View style={[s.activeNote, { borderColor: v1.border, backgroundColor: v1.surface }]}>
                <Feather name="gift" size={18} color={accent} />
                <Text style={[s.activeNoteText, { color: v1.text }]}>{t('subscription_beta_free')}</Text>
              </View>
            ) : Platform.OS === 'web' && !isActive ? (
              <Text style={[s.webNote, { color: v1.textMuted }]}>{t('plans_web_unavailable')}</Text>
            ) : showBuy ? (
              <PrimaryButton
                label={t('plans_buy_cta')}
                onPress={handleBuy}
                loading={purchasing}
                disabled={purchasing}
                accent={role === 'driver' ? 'driver' : 'cargo'}
                testID="plans-buy-button"
              />
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', paddingTop: 8, paddingBottom: 6 },
  subtitle: { fontSize: 14, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  body: { gap: 4 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  retryBtnText: { fontSize: 15, fontWeight: '600' },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  limitTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  limitPeriod: { fontSize: 12 },
  track: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  resetHint: { fontSize: 12, marginTop: 8 },
  exhausted: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12, gap: 4 },
  exhaustedTitle: { fontSize: 14, fontWeight: '700' },
  exhaustedHint: { fontSize: 12, lineHeight: 16 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontSize: 18, fontWeight: '800' },
  planDesc: { fontSize: 14, marginTop: 4 },
  proCard: { borderWidth: 2 },
  features: { marginTop: 12, gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 14, fontWeight: '500' },
  badge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  activeNote: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  activeNoteText: { fontSize: 14, fontWeight: '600', flex: 1 },
  webNote: { fontSize: 14, textAlign: 'center', paddingTop: 8 },
});
