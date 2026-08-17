import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TripDetail from './TripDetail';
import DealWorkspaceScreen from './DealWorkspaceScreen';
import { marketAPI } from '../utils/marketAPI';
import { chatAPI } from '../utils/chatAPI';
import { useV1Colors } from '../theme/designV1';

const ACTIVE = new Set(['accepted', 'in_progress', 'at_border', 'delivered']);

export default function TripDetailV2(props) {
  const { route } = props;
  const params = route?.params || {};
  const colors = useV1Colors();
  const tripId = params.tripId || params.trip?.id || null;
  const [target, setTarget] = React.useState(() => params.dealId ? { dealId: params.dealId, roomId: params.roomId || null } : null);
  const [checked, setChecked] = React.useState(Boolean(params.dealId));

  React.useEffect(() => {
    if (params.dealId) {
      setTarget({ dealId: params.dealId, roomId: params.roomId || null });
      setChecked(true);
      return undefined;
    }
    if (!tripId) { setChecked(true); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const dashboard = await marketAPI.myDashboard();
        const deal = (dashboard?.my_deals || []).find((item) =>
          String(item.trip_id || '') === String(tripId) && ACTIVE.has(item.status)
        );
        if (!deal || cancelled) { if (!cancelled) setChecked(true); return; }
        let roomId = null;
        try {
          const rooms = await chatAPI.rooms();
          roomId = (rooms?.rooms || []).find((room) => room.deal_id === deal.id)?.id || null;
        } catch { /* DealWorkspace can resolve the room itself. */ }
        if (!cancelled) {
          setTarget({ dealId: deal.id, roomId });
          setChecked(true);
        }
      } catch {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [params.dealId, params.roomId, tripId]);

  if (!checked) {
    return (
      <SafeAreaView style={[s.loading, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color="#168759" />
      </SafeAreaView>
    );
  }

  if (target?.dealId) {
    return (
      <DealWorkspaceScreen
        {...props}
        route={{
          ...route,
          params: {
            ...params,
            dealId: target.dealId,
            roomId: target.roomId,
            tripId,
          },
        }}
      />
    );
  }

  return <TripDetail {...props} />;
}

const s = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
