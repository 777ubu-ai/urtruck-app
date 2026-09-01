import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DealLocationPermissionGate from './DealLocationPermissionGate';
import DealWorkspaceScreenV2 from '../../screens/DealWorkspaceScreenV2';
import { chatAPI } from '../../utils/chatAPI';
import { DEAL_ACCESS } from '../../utils/dealAccess';
import { verifyDealMembership } from '../../utils/dealMembership';
import { useV1Colors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';

// Canonical route-level host for every accepted-deal workspace entry point.
// SECURITY INVARIANT: navigation params, push payloads and deeplinks carry only
// identifiers. They are never proof that the current user belongs to a deal.
// A verifiedDealAccess flag is accepted only from ChatScreenV2 after that
// screen resolved the exact deal through chatAPI.rooms() for the CURRENT user.
export default function DealWorkspaceRoute(props) {
  const params = props?.route?.params || {};
  const navigation = props?.navigation;
  const requestedDealId = params.dealId || null;
  const requestedRoomId = params.roomId || null;
  const trustedInternalAccess = params.verifiedDealAccess === true;
  const colors = useV1Colors();
  const { t } = useI18n();
  const { session, hasToken, loading: authLoading } = useAuth();
  const userId = session?.user?.id || null;
  const [attempt, setAttempt] = React.useState(0);
  const [access, setAccess] = React.useState(
    trustedInternalAccess && requestedDealId ? DEAL_ACCESS.ALLOWED : 'checking',
  );
  const [verifiedDealId, setVerifiedDealId] = React.useState(
    trustedInternalAccess && requestedDealId ? requestedDealId : null,
  );

  React.useEffect(() => {
    // ChatScreenV2 already proved this exact deal by finding its room in the
    // current user's server-scoped room list. Do not perform a second network
    // membership probe that can deadlock/timeout a legitimate participant.
    if (trustedInternalAccess && requestedDealId) {
      setVerifiedDealId(requestedDealId);
      setAccess(DEAL_ACCESS.ALLOWED);
      return undefined;
    }

    if (authLoading) {
      setAccess('checking');
      setVerifiedDealId(null);
      return undefined;
    }

    if (!hasToken) {
      setAccess(DEAL_ACCESS.DENIED);
      setVerifiedDealId(null);
      return undefined;
    }

    let cancelled = false;
    setAccess('checking');
    setVerifiedDealId(null);

    (async () => {
      try {
        let candidateDealId = requestedDealId;

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

        if (!candidateDealId) {
          setAccess(DEAL_ACCESS.DENIED);
          return;
        }

        const membership = await verifyDealMembership(candidateDealId);
        if (cancelled) return;

        if (membership.ok && membership.allowed) {
          setVerifiedDealId(candidateDealId);
          setAccess(DEAL_ACCESS.ALLOWED);
          return;
        }

        if (membership.ok || [401, 403, 404].includes(Number(membership.status))) {
          setAccess(DEAL_ACCESS.DENIED);
          return;
        }

        setAccess(DEAL_ACCESS.UNAVAILABLE);
      } catch {
        if (!cancelled) setAccess(DEAL_ACCESS.UNAVAILABLE);
      }
    })();

    return () => { cancelled = true; };
  }, [requestedDealId, requestedRoomId, trustedInternalAccess, userId, hasToken, authLoading, attempt]);

  React.useEffect(() => {
    if (access !== DEAL_ACCESS.DENIED) return undefined;
    const timer = setTimeout(() => {
      navigation?.navigate?.('Deals', { role: params.role });
    }, 0);
    return () => clearTimeout(timer);
  }, [access, navigation, params.role]);

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
