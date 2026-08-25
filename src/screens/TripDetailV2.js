import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TripDetail from './TripDetail';
import DealWorkspaceScreen from './DealWorkspaceScreenV2';
import DealLocationPermissionGate from '../components/deal/DealLocationPermissionGate';
import { marketAPI } from '../utils/marketAPI';
import { chatAPI } from '../utils/chatAPI';
import { getDealCounterpartyProfile, compactCounterpartyName } from '../utils/dealCounterpartyAPI';
import { useV1Colors } from '../theme/designV1';

const ACTIVE = new Set(['accepted', 'in_progress', 'at_border', 'delivered', 'received']);

export default function TripDetailV2(props) {
  const { route } = props;
  const params = route?.params || {};
  const colors = useV1Colors();
  const tripId = params.tripId || params.trip?.id || null;
  const [target, setTarget] = React.useState(() => params.dealId ? { dealId: params.dealId, roomId: params.roomId || null, partner: params.partner || null } : null);
  const [checked, setChecked] = React.useState(Boolean(params.dealId && params.partner));

  React.useEffect(() => {
    if (!tripId && params.dealId) {
      setTarget({ dealId: params.dealId, roomId: params.roomId || null, partner: params.partner || null });
      setChecked(true);
      return undefined;
    }
    if (!tripId) { setChecked(true); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const dashboard = await marketAPI.myDashboard();
        const deal = params.dealId
          ? (dashboard?.my_deals || []).find((item) => String(item.id) === String(params.dealId))
          : (dashboard?.my_deals || []).find((item) => String(item.trip_id || '') === String(tripId) && ACTIVE.has(item.status));
        if (!deal || cancelled) { if (!cancelled) setChecked(true); return; }
        let room = null;
        try {
          const rooms = await chatAPI.rooms();
          room = (rooms?.rooms || []).find((item) => item.deal_id === deal.id) || null;
        } catch { /* DealWorkspace can resolve the room itself. */ }
        let partner = params.partner || null;
        if (room?.partner_id) {
          const profile = await getDealCounterpartyProfile(room.partner_id).catch(() => null);
          partner = {
            ...(partner || {}),
            id: room.partner_id,
            role: room.partner_role || profile?.role || partner?.role || null,
            name: compactCounterpartyName(profile, room.partner_name || partner?.name || ''),
            profile,
          };
        }
        if (!cancelled) {
          setTarget({ dealId: deal.id, roomId: room?.id || params.roomId || null, partner });
          setChecked(true);
        }
      } catch {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [params.dealId, params.roomId, params.partner, tripId]);

  if (!checked) {
    return (
      <SafeAreaView style={[s.loading, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color="#168759" />
      </SafeAreaView>
    );
  }

  if (target?.dealId) {
    // P1 (аудит 2026-08-21): см. тот же комментарий в CargoDetailV2.js —
    // без DealLocationPermissionGate «Начать рейс» из «Мои рейсы»/«Сделки»/
    // уведомлений падал в disclosure_host_unavailable. Для водителя это был
    // основной путь входа в сделку.
    return (
      <DealLocationPermissionGate
        dealId={target.dealId}
        role={params.role}
        initialStatus={params.dealStatus}
      >
        <DealWorkspaceScreen
          {...props}
          route={{
            ...route,
            params: {
              ...params,
              dealId: target.dealId,
              roomId: target.roomId,
              partner: target.partner || params.partner || null,
              tripId,
            },
          }}
        />
      </DealLocationPermissionGate>
    );
  }

  return <TripDetail {...props} />;
}

const s = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });