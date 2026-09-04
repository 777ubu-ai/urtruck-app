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
  const [resolvedDealId, setResolvedDealId] = React.useState(params.dealId || null);
  const [resolvedRoomId, setResolvedRoomId] = React.useState(params.roomId || null);
  const [resolvedPartner, setResolvedPartner] = React.useState(params.partner || null);
  const [checked, setChecked] = React.useState(Boolean(params.dealId && params.partner));
  const [blockedPartnerEntry, setBlockedPartnerEntry] = React.useState(false);

  React.useEffect(() => {
    const roomId = params.roomId;
    const partnerId = params.partner?.id || null;

    // A direct route with an explicit deal is already canonical. A route with
    // neither a room nor a concrete partner is a support/general conversation
    // and may keep using the legacy ChatScreen below.
    if (!roomId && !partnerId) {
      setResolvedDealId(params.dealId || null);
      setResolvedRoomId(params.roomId || null);
      setResolvedPartner(params.partner || null);
      setBlockedPartnerEntry(false);
      setChecked(true);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await chatAPI.rooms();
        if (cancelled) return;
        const rooms = Array.isArray(data?.rooms) ? data.rooms : [];

        // DriverDetail historically opened Chat with { partner } only. That
        // bypassed room/deal resolution and always fell through to the old
        // ChatScreen even when this driver was already the accepted carrier.
        // Resolve a deal-linked room by partner id so every accepted-deal
        // entry point converges on DealWorkspaceRoute.
        const room = roomId
          ? rooms.find((item) => String(item.id) === String(roomId))
          : rooms.find((item) => item.deal_id && String(item.partner_id) === String(partnerId));

        const nextDealId = params.dealId || room?.deal_id || null;
        const nextRoomId = params.roomId || room?.id || null;
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

        // Profile/contact is not a support chat. If there is no deal-linked
        // room, fail closed and return the user to Deals instead of exposing
        // the legacy pre-deal messenger. This matches the product rule that
        // chat exists only after an accepted offer.
        const partnerOnlyWithoutDeal = Boolean(partnerId && !roomId && !nextDealId);
        setBlockedPartnerEntry(partnerOnlyWithoutDeal);
        setResolvedDealId(nextDealId);
        setResolvedRoomId(nextRoomId);
        setResolvedPartner(nextPartner);
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
      <SafeAreaView style={[s.loading, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color="#168759" />
      </SafeAreaView>
    );
  }

  if (resolvedDealId) {
    const nextRoute = {
      ...route,
      params: {
        ...params,
        dealId: resolvedDealId,
        roomId: params.roomId || resolvedRoomId || null,
        partner: resolvedPartner || params.partner || null,
      },
    };
    return <DealWorkspaceRoute {...props} route={nextRoute} />;
  }

  return <DealWorkspaceRoute {...props} route={{
    ...route,
    params: {
      ...params,
      dealId: resolvedDealId || null,
      roomId: params.roomId || resolvedRoomId || null,
      partner: resolvedPartner || params.partner || null,
    },
  }} />;
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
