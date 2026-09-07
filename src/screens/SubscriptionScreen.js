// SubscriptionScreen — подписка на разблокировку контактов (Google Play
// Billing). Сервер — единственный источник правды о лимите и статусе
// подписки (см. backend/api/marketplace.py:get_deal), этот экран только
// показывает состояние и запускает покупку через react-native-iap.
//
// Веб не продаёт подписку (Google Play Billing — Android-only) — на web
// экран просто объясняет это и не трогает нативный IAP-модуль вовсе.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { useToast } from '../components/Toast';
import { subscriptionAPI } from '../utils/subscription';
import { IS_BETA } from '../config/env';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Feather from '@expo/vector-icons/Feather';

// react-native-iap — нативный модуль, на web не поддержан. Динамический
// require под Platform-гейтом, чтобы веб-бандл вообще не трогал его.
let RNIap = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line global-require
  RNIap = require('react-native-iap');
}

export default function SubscriptionScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const { toast } = useToast();
  const role = route?.params?.role;
  const accent = role === 'driver' ? v1.driver : v1.cargoOwner;

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Restore purchase: покупка могла состояться на другом устройстве/до
  // переустановки — при входе на экран переспрашиваем Google Play и
  // верифицируем найденное на сервере. Полностью best-effort: restore не
  // должен ломать экран, если Play Services недоступны.
  const restorePurchase = useCallback(async (productId) => {
    if (!RNIap || !productId) return;
    try {
      const purchases = await RNIap.getAvailablePurchases();
      const match = (purchases || []).find((p) => p?.productId === productId && p?.purchaseToken);
      if (!match) return;
      const verify = await subscriptionAPI.verifyGooglePurchase(match.productId, match.purchaseToken);
      try {
        await RNIap.finishTransaction({ purchase: match, isConsumable: false });
      } catch {}
      if (!mountedRef.current) return;
      if (verify.ok && verify.active) {
        toast(t('subscription_purchase_success'));
        const r = await subscriptionAPI.status();
        if (r.ok && mountedRef.current) setStatus(r);
      }
    } catch {
      // restore — best-effort, молча игнорируем
    }
  }, [toast, t]);

  const loadStatus = useCallback(async () => {
    const r = await subscriptionAPI.status();
    if (!mountedRef.current) return;
    if (r.ok) {
      setStatus(r);
      setLoadError(false);
      if (!r.active) restorePurchase(r.google_product_id);
    } else {
      // Ошибка сети ≠ «подписки нет»: показываем состояние ошибки с retry,
      // а не экран покупки как будто active=false подтверждён сервером.
      setLoadError(true);
    }
    setLoading(false);
  }, [restorePurchase]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // IAP connection + слушатели покупок — только на нативных платформах.
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
        // соединение с Google Play недоступно (эмулятор без Play Services и
        // т.п.) — экран остаётся рабочим, просто кнопка покупки ошибётся
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

  const used = status?.contacts_used_this_period ?? 0;
  const limit = status?.contacts_limit;
  const isActive = !!status?.active;
  // Пилот (IS_BETA) + серверная монетизация выключена → контакты бесплатны,
  // кнопку покупки не показываем вовсе.
  const isPilotFree = IS_BETA && !!status && !status.monetization_enabled;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent} compact />
      <Text style={[s.title, { color: v1.text }]}>{t('subscription_title')}</Text>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={v1.textMuted} /></View>
      ) : loadError ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={28} color={v1.textMuted} />
          <Text style={[s.errorText, { color: v1.textMuted }]}>{t('subscription_load_error')}</Text>
          <TouchableOpacity
            style={[s.retryBtn, { borderColor: accent }]}
            onPress={() => { setLoading(true); setLoadError(false); loadStatus(); }}
            testID="subscription-retry-button"
          >
            <Text style={[s.retryBtnText, { color: accent }]}>{t('subscription_retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.body}>
          <View style={[s.card, { backgroundColor: v1.surface, borderColor: v1.border }]}>
            <View style={s.cardRow}>
              <Feather name={isActive ? 'zap' : 'lock'} size={20} color={isActive ? accent : v1.textMuted} />
              <Text style={[s.cardTitle, { color: v1.text }]}>
                {isActive ? t('subscription_active') : t('subscription_inactive')}
              </Text>
            </View>
            {limit == null ? (
              <Text style={[s.cardSub, { color: v1.textMuted }]}>{t('subscription_unlimited')}</Text>
            ) : (
              <Text style={[s.cardSub, { color: v1.textMuted }]}>
                {(t('subscription_usage') || '').replace('{used}', used).replace('{limit}', limit)}
              </Text>
            )}
          </View>

          {isPilotFree ? (
            <View style={[s.betaNote, { borderColor: v1.border, backgroundColor: v1.surface }]}>
              <Feather name="gift" size={18} color={accent} />
              <Text style={[s.betaNoteText, { color: v1.text }]}>{t('subscription_beta_free')}</Text>
            </View>
          ) : Platform.OS === 'web' ? (
            <Text style={[s.webNote, { color: v1.textMuted }]}>{t('subscription_web_unavailable')}</Text>
          ) : !isActive ? (
            <TouchableOpacity
              style={[s.buyBtn, { backgroundColor: accent }]}
              onPress={handleBuy}
              disabled={purchasing}
              testID="subscription-buy-button"
            >
              {purchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={s.buyBtnText}>{t('subscription_buy_cta')}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  body: { paddingHorizontal: 16, gap: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 14 },
  buyBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buyBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  webNote: { fontSize: 14, textAlign: 'center', paddingTop: 8 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  retryBtnText: { fontSize: 15, fontWeight: '600' },
  betaNote: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  betaNoteText: { fontSize: 14, fontWeight: '600', flex: 1 },
});
