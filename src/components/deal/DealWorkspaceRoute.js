import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DealLocationPermissionGate from './DealLocationPermissionGate';
import DealWorkspaceScreenV2 from '../../screens/DealWorkspaceScreenV2';
import { marketAPI } from '../../utils/marketAPI';
import { DEAL_ACCESS, classifyDealAccess } from '../../utils/dealAccess';
import { useV1Colors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';

// Canonical route-level host for every accepted-deal workspace entry point.
// SECURITY INVARIANT: a dealId coming from navigation, push or deeplink is only
// an identifier. Before mounting GPS disclosure, map, chat or composer we must
// ask the backend for that deal using the current authenticated user. The
// backend is authoritative and returns 403 for a non-participant.
export default function DealWorkspaceRoute(props) {
  const params = props?.route?.params || {};
  const navigation = props?.navigation;
  const dealId = params.dealId || null;
  const colors = useV1Colors();
  const { t } = useI18n();
  const [attempt, setAttempt] = React.useState(0);
  const [access, setAccess] = React.useState(dealId ? 'checking' : DEAL_ACCESS.ALLOWED);

  React.useEffect(() => {
    if (!dealId) {
      setAccess(DEAL_ACCESS.ALLOWED);
      return undefined;
    }

    let cancelled = false;
    setAccess('checking');

    (async () => {
      try {
        const result = await marketAPI.getDeal(dealId);
        if (cancelled) return;
        setAccess(classifyDealAccess(result));
      } catch {
        if (!cancelled) setAccess(DEAL_ACCESS.UNAVAILABLE);
      }
    })();

    return () => { cancelled = true; };
  }, [dealId, attempt]);

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
  if (dealId && access !== DEAL_ACCESS.ALLOWED) {
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

  return (
    <DealLocationPermissionGate role={params.role}>
      <DealWorkspaceScreenV2 {...props} />
    </DealLocationPermissionGate>
  );
}

const s = StyleSheet.create({
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  guardText: { fontSize: 13, textAlign: 'center' },
  retry: { minHeight: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
