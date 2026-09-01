import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DealLocationPermissionGate from './DealLocationPermissionGate';
import DealWorkspaceScreenV2 from '../../screens/DealWorkspaceScreenV2';
import { marketAPI } from '../../utils/marketAPI';
import { chatAPI } from '../../utils/chatAPI';
import { DEAL_ACCESS, classifyDealAccess } from '../../utils/dealAccess';
import { useV1Colors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';

// Canonical route-level host for every accepted-deal workspace entry point.
// SECURITY INVARIANT: navigation params, push payloads and deeplinks carry only
// identifiers. They are never proof that the current user belongs to a deal.
// Before mounting GPS disclosure, map, chat, documents or composer we resolve a
// room through the CURRENT user's room list (when needed) and then ask the
// backend for the deal. GET /market/deals/{id} is authoritative and returns 403
// for a non-participant.
export default function DealWorkspaceRoute(props) {
  const params = props?.route?.params || {};
  const navigation = props?.navigation;
  const requestedDealId = params.dealId || null;
  const requestedRoomId = params.roomId || null;
  const colors = useV1Colors();
  const { t } = useI18n();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [attempt, setAttempt] = React.useState(0);
  const [access, setAccess] = React.useState('checking');
  const [verifiedDealId, setVerifiedDealId] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setAccess('checking');
    setVerifiedDealId(null);

    (async () => {
      try {
        let candidateDealId = requestedDealId;

        // A direct room deeplink is also untrusted. It is accepted only if the
        // room is present in chatAPI.rooms() for the CURRENT session and is
        // linked to a deal. An arbitrary/foreign room id therefore never gets
        // as far as the workspace renderer.
        if (!candidateDealId && requestedRoomId) {
          const roomData = await chatAPI.rooms();
          if (cancelled) return;
          const rooms = Array.isArray(roomData?.rooms) ? roomData.rooms : [];
          const room = rooms.find((item) => String(item.id) === String(requestedRoomId));
          if (!room?.deal_id) {
            setAccess(DEAL_ACCESS.DENIED);
            return;
          }
          candidateDealId = room.deal_id;
        }

        // DealWorkspaceRoute is for accepted-deal workspaces only. Without a
        // verified deal context, fail closed instead of rendering an empty
        // composer that could disclose or imply private deal access.
        if (!candidateDealId) {
          setAccess(DEAL_ACCESS.DENIED);
          return;
        }

        const result = await marketAPI.getDeal(candidateDealId);
        if (cancelled) return;
        const classified = classifyDealAccess(result);
        if (classified === DEAL_ACCESS.ALLOWED) {
          setVerifiedDealId(candidateDealId);
        }
        setAccess(classified);
      } catch {
        if (!cancelled) setAccess(DEAL_ACCESS.UNAVAILABLE);
      }
    })();

    return () => { cancelled = true; };
  }, [requestedDealId, requestedRoomId, userId, attempt]);

  React.useEffect(() => {
    if (access !== DEAL_ACCESS.DENIED) return undefined;
    const timer = setTimeout(() => {
      navigation?.navigate?.('Deals', { role: params.role });
    }, 0);
    return () => clearTimeout(timer);
  }, [access, navigation, params.role]);

  // Fail closed: while membership is unverified, denied, or temporarily
  // unavailable, do not mount DealLocationPermissionGate/DealWorkspace at all.
  // This prevents a loser/non-participant from seeing route, partner, map,
  // statuses, documents or composer even for a single optimistic frame.
  if (access !== DEAL_ACCESS.ALLOWED || !verifiedDealId) {
    const unavailable = access === DEAL_ACCESS.UNAVAILABLE;
    return (
      <SafeAreaView style={[s.guard, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-access-guard">
        <ActivityIndicator color="#168759" />
        {unavailable ? (
          <>
            <Text style={[s.guardText, { color: colors.textMuted }]}>{t('no_connection')}</Text>
            <TouchableOpacity
              style={s.retry}
              onPress={() => setAttempt((value) => value + 1)}
              testID="deal-access-retry"
            >
              <Text style={s.retryText}>{t('chat_attach_retry')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </SafeAreaView>
    );
  }

  // roomId-only entry points are normalized to the verified deal id so the
  // workspace and its downstream APIs all operate on the same authorized deal.
  const verifiedRoute = requestedDealId === verifiedDealId
    ? props.route
    : {
        ...props.route,
        params: { ...params, dealId: verifiedDealId },
      };

  return (
    <DealLocationPermissionGate role={params.role}>
      <DealWorkspaceScreenV2 {...props} route={verifiedRoute} />
    </DealLocationPermissionGate>
  );
}

const s = StyleSheet.create({
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  guardText: { fontSize: 13, textAlign: 'center' },
  retry: { minHeight: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
