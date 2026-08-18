import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChatScreen from './ChatScreen';
import DealWorkspaceScreen from './DealWorkspaceScreenV2';
import DealLocationPermissionGate from '../components/deal/DealLocationPermissionGate';
import { chatAPI } from '../utils/chatAPI';
import { getDealCounterpartyProfile, compactCounterpartyName } from '../utils/dealCounterpartyAPI';
import { useV1Colors } from '../theme/designV1';

// Accepted deal rooms use the three-zone map-first workspace. Support/general/
// pre-deal conversations keep the mature legacy ChatScreen.
export default function ChatScreenV2(props) {
  const { route } = props;
  const params = route?.params || {};
  const colors = useV1Colors();
  const [resolvedDealId, setResolvedDealId] = React.useState(params.dealId || null);
  const [resolvedPartner, setResolvedPartner] = React.useState(params.partner || null);
  const [checked, setChecked] = React.useState(Boolean(params.dealId && params.partner));

  React.useEffect(() => {
    const roomId = params.roomId;
    if (!roomId) {
      setResolvedDealId(params.dealId || null);
      setResolvedPartner(params.partner || null);
      setChecked(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await chatAPI.rooms();
        if (cancelled) return;
        const room = (data?.rooms || []).find((item) => item.id === roomId);
        const nextDealId = params.dealId || room?.deal_id || null;
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
        setResolvedDealId(nextDealId);
        setResolvedPartner(nextPartner);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [params.dealId, params.roomId, params.partner]);

  if (!checked) {
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
        partner: resolvedPartner || params.partner || null,
      },
    };
    return (
      <DealLocationPermissionGate
        dealId={resolvedDealId}
        role={params.role}
        initialStatus={params.dealStatus}
      >
        <DealWorkspaceScreen {...props} route={nextRoute} />
      </DealLocationPermissionGate>
    );
  }

  return <ChatScreen {...props} />;
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
