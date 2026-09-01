import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DealWorkspaceRoute from '../components/deal/DealWorkspaceRoute';
import { getDealCounterpartyProfile, compactCounterpartyName } from '../utils/dealCounterpartyAPI';
import { DEAL_ACCESS } from '../utils/dealAccess';
import { DEAL_LINK_VERIFYING, resolveDealLinkAccess } from '../utils/dealLinkGuard';
import { useAuth } from '../utils/AuthContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';

// Accepted deal rooms use the canonical gated workspace route. Support/general
// conversations may keep the mature legacy ChatScreen, but a partner/profile
// entry must never create or expose a pre-deal chat.
//
// P0 2026-09-01: guard доступа переведён на КОНЕЧНЫЕ состояния (см. подробный
// разбор первопричины в src/utils/dealLinkGuard.js). Явный dealId проверяется
// ПЕРВЫМ же запросом через лёгкий участник-gated GET /market/deals/{id};
// тяжёлый /market/my из deeplink-пути исключён. Никакого вечного спиннера:
//   checking    → спиннер (deal-access-guard);
//   allowed     → workspace (verifiedDealAccess: true);
//   denied      → «Нет доступа к этой сделке» + «К сделкам» (fail closed);
//   unavailable → «Не удалось проверить доступ» + «Повторить» (retryable).
export default function ChatScreenV2(props) {
  const { route, navigation } = props;
  const params = route?.params || {};
  const colors = useV1Colors();
  const { t } = useI18n();
  // Auth-gate без setTimeout-костылей: пока AuthContext поднимает сессию из
  // storage — держим checking и НЕ шлём запросы; без токена — fail closed.
  const { hasToken, loading: authLoading } = useAuth();

  const requestedDealId = params.dealId || null;
  const requestedRoomId = params.roomId || null;
  const partnerId = params.partner?.id || null;
  const hasEntryIds = Boolean(requestedDealId || requestedRoomId || partnerId);

  const [attempt, setAttempt] = React.useState(0);
  const [guard, setGuard] = React.useState({ state: DEAL_LINK_VERIFYING });
  const [resolvedPartner, setResolvedPartner] = React.useState(params.partner || null);

  React.useEffect(() => {
    if (!hasEntryIds) return undefined;
    if (authLoading) {
      setGuard({ state: DEAL_LINK_VERIFYING });
      return undefined;
    }
    if (!hasToken) {
      setGuard({ state: DEAL_ACCESS.DENIED, source: 'auth' });
      return undefined;
    }

    let cancelled = false;
    setGuard({ state: DEAL_LINK_VERIFYING });

    (async () => {
      const decision = await resolveDealLinkAccess({
        dealId: requestedDealId,
        roomId: requestedRoomId,
        partnerId,
      });
      if (cancelled) return;

      // Диагностика P0: только идентификаторы/тайминги/решение. Токены,
      // auth-заголовки, телефоны — НИКОГДА не логируем.
      console.log('[deal-deeplink]', JSON.stringify({
        dealId: requestedDealId,
        roomId: requestedRoomId,
        partnerEntry: Boolean(partnerId),
        source: decision.source || null,
        decision: decision.state,
        status: decision.status ?? null,
        error: decision.error || null,
        durationMs: decision.durationMs,
        authReady: !authLoading,
        hasToken,
      }));

      // Обогащение шапки именем/профилем контрагента — только для rooms-входа
      // (как раньше); для direct-deal партнёр приходит параметрами навигации.
      const room = decision.room || null;
      if (decision.state === DEAL_ACCESS.ALLOWED && room?.deal_id && room?.partner_id) {
        const profile = await getDealCounterpartyProfile(room.partner_id).catch(() => null);
        if (cancelled) return;
        setResolvedPartner((prev) => ({
          ...(prev || {}),
          id: room.partner_id,
          role: room.partner_role || profile?.role || prev?.role || null,
          name: compactCounterpartyName(profile, room.partner_name || prev?.name || ''),
          profile,
        }));
      }

      setGuard(decision);
    })();

    return () => { cancelled = true; };
  }, [hasEntryIds, requestedDealId, requestedRoomId, partnerId, hasToken, authLoading, attempt]);

  // Вход без идентификаторов (support/general) — прежний fallback-рендер ниже.
  if (hasEntryIds) {
    if (guard.state === DEAL_LINK_VERIFYING) {
      return (
        <SafeAreaView style={[s.guard, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-access-guard">
          <ActivityIndicator color="#168759" />
        </SafeAreaView>
      );
    }

    if (guard.state === DEAL_ACCESS.DENIED) {
      return (
        <SafeAreaView style={[s.guard, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-access-denied">
          <Text style={[s.guardTitle, { color: colors.text }]}>{t('deal_access_denied_title')}</Text>
          <TouchableOpacity
            style={s.guardBtn}
            onPress={() => navigation.navigate('Deals', { role: params.role })}
            testID="deal-access-go-deals"
          >
            <Text style={s.guardBtnText}>{t('deal_access_go_deals')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    if (guard.state === DEAL_ACCESS.UNAVAILABLE) {
      return (
        <SafeAreaView style={[s.guard, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-access-unavailable">
          <Text style={[s.guardTitle, { color: colors.text }]}>{t('deal_access_check_failed')}</Text>
          <TouchableOpacity
            style={s.guardBtn}
            onPress={() => setAttempt((value) => value + 1)}
            testID="deal-access-retry"
          >
            <Text style={s.guardBtnText}>{t('chat_attach_retry')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    if (guard.state === DEAL_ACCESS.ALLOWED && guard.dealId) {
      const nextRoute = {
        ...route,
        params: {
          ...params,
          dealId: guard.dealId,
          roomId: guard.roomId || params.roomId || null,
          partner: resolvedPartner || params.partner || null,
          verifiedDealAccess: true,
        },
      };
      return <DealWorkspaceRoute {...props} route={nextRoute} />;
    }
  }

  return <DealWorkspaceRoute {...props} route={{
    ...route,
    params: {
      ...params,
      dealId: null,
      roomId: null,
      partner: resolvedPartner || params.partner || null,
      verifiedDealAccess: false,
    },
  }} />;
}

const s = StyleSheet.create({
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  guardTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  guardBtn: { minHeight: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },
  guardBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
