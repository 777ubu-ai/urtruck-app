import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChatScreen from './ChatScreen';
import DealWorkspaceScreen from './DealWorkspaceScreen';
import { chatAPI } from '../utils/chatAPI';
import { useV1Colors } from '../theme/designV1';

// Accepted deal rooms use the new map-first workspace. Support/general/pre-deal
// conversations keep the mature legacy ChatScreen, so this change does not
// regress non-deal chat functionality.
export default function ChatScreenV2(props) {
  const { route } = props;
  const params = route?.params || {};
  const colors = useV1Colors();
  const [resolvedDealId, setResolvedDealId] = React.useState(params.dealId || null);
  const [checked, setChecked] = React.useState(Boolean(params.dealId));

  React.useEffect(() => {
    if (params.dealId) {
      setResolvedDealId(params.dealId);
      setChecked(true);
      return undefined;
    }
    const roomId = params.roomId;
    if (!roomId) {
      setChecked(true);
      return undefined;
    }
    let cancelled = false;
    chatAPI.rooms()
      .then((data) => {
        if (cancelled) return;
        const room = (data?.rooms || []).find((item) => item.id === roomId);
        setResolvedDealId(room?.deal_id || null);
        setChecked(true);
      })
      .catch(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [params.dealId, params.roomId]);

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
      params: { ...params, dealId: resolvedDealId },
    };
    return <DealWorkspaceScreen {...props} route={nextRoute} />;
  }

  return <ChatScreen {...props} />;
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
