import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DealWorkspaceRoute from '../components/deal/DealWorkspaceRoute';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { getDealCounterpartyProfile, compactCounterpartyName } from '../utils/dealCounterpartyAPI';
import { useV1Colors } from '../theme/designV1';

// Accepted deal rooms use the canonical gated workspace route. Support/general
// conversations may keep the mature legacy ChatScreen, but a partner/profile
// entry must never create or expose a pre-deal chat.
export default function ChatScreenV2(props) {
  const { route, navigation } = props;
  const params = route?.params || {};
  const colors = useV1Colors();
  const [resolvedDealId, setResolvedDealId] = React.useState(null);
  const [resolvedRoomId, setResolvedRoomId] = React.useState(null);
  const [resolvedPartner, setResolvedPartner] = React.useState(params.partner || null);
  const [verifiedDealAccess, setVerifiedDealAccess] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [blockedPartnerEntry, setBlockedPartnerEntry] = React.useState(false);

  React.useEffect(() => {
    const roomId = params.roomId || null;
    const partnerId = params.partner?.id || null;
    const requestedDealId = params.dealId || null;

    if (!requestedDealId && !roomId && !partnerId) {
      setResolvedDealId(null);
      setResolvedRoomId(null);
      setResolvedPartner(params.partner || null);
      setVerifiedDealAccess(false);
      setBlockedPartnerEntry(false);
      setChecked(true);
      return undefined;
    }

    let cancelled = false;
    setChecked(false);
    setVerifiedDealAccess(false);
    setBlockedPartnerEntry(false);

    (async () => {
      try {
        // SECURITY: explicit deal deeplinks are authorized only by server-side
        // membership. First share the same cached/in-flight dashboard request
        // as DealsScreen/BottomNav. Do NOT force a second heavy /market/my call:
        // physical Android tests showed that the forced request could exceed
        // authedFetch's 20s timeout and abort while the normal Deals UI worked.
        if (requestedDealId) {
          let deal = null;
          let dashboardUnavailable = false;

          try {
            const dashboard = await marketAPI.myDashboard();
            if (cancelled) return;
            dashboardUnavailable = Boolean(
              dashboard?.serverError || dashboard?.authRequired || dashboard?.skipped
            );
            if (!dashboardUnavailable) {
              deal = (Array.isArray(dashboard?.my_deals) ? dashboard.my_deals : [])
                .find((item) => String(item?.id || '') === String(requestedDealId)) || null;
            }
          } catch (error) {
            dashboardUnavailable = true;
            console.warn('[deal-deeplink-access] dashboard unavailable', error?.message || 'error');
          }

          if (cancelled) return;

          // Confirm missing/stale/aborted dashboard state against the lightweight
          // single-deal endpoint. Backend GET /market/deals/{id} performs the
          // participant check itself: participant => 200; loser => 403;
          // nonexistent deal => 404. Route params alone never grant access.
          if (!deal) {
            try {
              const direct = await marketAPI.getDeal(requestedDealId);
              if (cancelled) return;
              if (direct && direct.ok !== false && String(direct.id || '') === String(requestedDealId)) {
                deal = direct;
              } else if (direct?.ok === false && [401, 403, 404].includes(Number(direct.status))) {
                setBlockedPartnerEntry(true);
                return;
              } else if (dashboardUnavailable) {
                setBlockedPartnerEntry(true);
                return;
              }
            } catch (error) {
              console.warn('[deal-deeplink-access] direct deal fallback failed', error?.message || 'error');
              setBlockedPartnerEntry(true);
              return;
            }
          }

          if (!deal) {
            setBlockedPartnerEntry(true);
            return;
          }

          setResolvedDealId(deal.id);
          setResolvedRoomId(deal.chat_room_id || roomId || null);
          setResolvedPartner(params.partner || null);
          setVerifiedDealAccess(true);
          return;
        }

        // roomId / partner-only entry points still resolve through the current
        // user's chat-room list. These paths never treat route params alone as
        // proof of access.
        const data = await chatAPI.rooms();
        if (cancelled) return;
        const rooms = Array.isArray(data?.rooms) ? data.rooms : [];

        let room = null;
        if (roomId) {
          room = rooms.find((item) => String(item.id) === String(roomId)) || null;
        } else if (partnerId) {
          room = rooms.find((item) => item.deal_id && String(item.partner_id) === String(partnerId)) || null;
        }

        const nextDealId = room?.deal_id || null;
        const accessVerified = Boolean(room?.deal_id);

        let nextPartner = params.partner || null;
        if (room?.partner_id) {
          const profile = await getDealCounterpartyProfile(room.partner_id).catch(() => null);
          if (cancelled) return;
          nextPartner = {
            ...(nextPartner || {}),
            id: room.partner_id,
            role: room.partner_role || profile?.role || nextPartner?.role || null,
            name: compactCounterpartyName(profile, room.partner_name || nextPartner?.name || ''),
            profile,
          };
        }

        const partnerOnlyWithoutDeal = Boolean(partnerId && !roomId && !nextDealId);
        const directRoomDenied = Boolean(roomId && !room?.deal_id);
        const blocked = partnerOnlyWithoutDeal || directRoomDenied;

        setBlockedPartnerEntry(blocked);
        setResolvedDealId(accessVerified ? nextDealId : null);
        setResolvedRoomId(accessVerified ? room?.id || null : null);
        setResolvedPartner(nextPartner);
        setVerifiedDealAccess(accessVerified);
      } catch {
        if (!cancelled) {
          setBlockedPartnerEntry(true);
          setResolvedDealId(null);
          setResolvedRoomId(null);
          setVerifiedDealAccess(false);
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [params.dealId, params.roomId, params.partner, params.partner?.id]);

  React.useEffect(() => {
    if (!blockedPartnerEntry) return;
    navigation.navigate('Deals', { role: params.role });
  }, [blockedPartnerEntry, navigation, params.role]);

  if (!checked || blockedPartnerEntry) {
    return (
      <SafeAreaView style={[s.loading, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-access-guard">
        <ActivityIndicator color="#168759" />
      </SafeAreaView>
    );
  }

  if (resolvedDealId && verifiedDealAccess) {
    const nextRoute = {
      ...route,
      params: {
        ...params,
        dealId: resolvedDealId,
        roomId: resolvedRoomId || params.roomId || null,
        partner: resolvedPartner || params.partner || null,
        verifiedDealAccess: true,
      },
    };
    return <DealWorkspaceRoute {...props} route={nextRoute} />;
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
