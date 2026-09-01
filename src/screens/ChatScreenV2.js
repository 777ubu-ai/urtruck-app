import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DealWorkspaceRoute from '../components/deal/DealWorkspaceRoute';
import { chatAPI } from '../utils/chatAPI';
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

    // No deal/room/partner context means this route has nothing private to
    // resolve. Preserve the legacy/general-chat fallback behavior.
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

    (async () => {
      try {
        // SECURITY: chatAPI.rooms() is scoped by the current authenticated
        // user. A deal deeplink is trusted only when that exact deal has a
        // room in the CURRENT user's room list. This gives shipper/winner the
        // same positive path as normal Deals UI while the losing bidder has no
        // matching room and therefore never reaches the workspace.
        const data = await chatAPI.rooms();
        if (cancelled) return;
        const rooms = Array.isArray(data?.rooms) ? data.rooms : [];

        let room = null;
        if (roomId) {
          room = rooms.find((item) => String(item.id) === String(roomId)) || null;
        } else if (requestedDealId) {
          room = rooms.find((item) => String(item.deal_id) === String(requestedDealId)) || null;
        } else if (partnerId) {
          room = rooms.find((item) => item.deal_id && String(item.partner_id) === String(partnerId)) || null;
        }

        const nextDealId = room?.deal_id || null;
        const exactRequestedDeal = !requestedDealId || String(nextDealId) === String(requestedDealId);
        const accessVerified = Boolean(room?.deal_id && exactRequestedDeal);

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

        const explicitDealDenied = Boolean(requestedDealId && !accessVerified);
        const partnerOnlyWithoutDeal = Boolean(partnerId && !roomId && !requestedDealId && !nextDealId);
        const directRoomDenied = Boolean(roomId && !room?.deal_id);
        const blocked = explicitDealDenied || partnerOnlyWithoutDeal || directRoomDenied;

        setBlockedPartnerEntry(blocked);
        setResolvedDealId(accessVerified ? nextDealId : null);
        setResolvedRoomId(accessVerified ? room?.id || null : null);
        setResolvedPartner(nextPartner);
        setVerifiedDealAccess(accessVerified);
      } catch {
        // Network/server failure is also fail-closed. Do not optimistically
        // expose deal UI when membership cannot be proven.
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
