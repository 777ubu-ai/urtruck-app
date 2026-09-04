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
  const [purchasing, setPurchasing] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadStatus = useCallback(async () => {
    const r = await subscriptionAPI.status();
    if (!mountedRef.current) return;
    if (r.ok) setStatus(r);
    setLoading(false);
  }, []);

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
      await RNIap.requestSubscription({ sku: status.google_product_id });
    } catch {
      setPurchasing(false);
      toast(t('subscription_purchase_error'));
    }
  }, [status?.google_product_id, toast, t]);

  const used = status?.contacts_used_this_period ?? 0;
  const limit = status?.contacts_limit;
  const isActive = !!status?.active;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent} compact />
      <Text style={[s.title, { color: v1.text }]}>{t('subscription_title')}</Text>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={v1.textMuted} /></View>
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

          {Platform.OS === 'web' ? (
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, gap: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 14 },
  buyBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buyBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  webNote: { fontSize: 14, textAlign: 'center', paddingTop: 8 },
});
