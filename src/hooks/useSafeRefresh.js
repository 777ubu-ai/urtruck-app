import { InteractionManager, Platform } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useMountedRef } from './useMountedRef';

// iOS can become unstable when pull-to-refresh starts a second refresh while
// the first one is still settling, or when the spinner is torn down before
// native scroll interactions fully finish. This hook serializes refreshes and
// lets iOS finish the gesture/animation cycle before hiding RefreshControl.
export function useSafeRefresh(task) {
  const mounted = useMountedRef();
  const inFlightRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const finishRefresh = useCallback(() => {
    const apply = () => {
      inFlightRef.current = false;
      if (mounted.current) setRefreshing(false);
    };
    if (Platform.OS === 'ios') {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(apply);
      });
      return;
    }
    apply();
  }, [mounted]);

  const onRefresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (mounted.current) setRefreshing(true);
    try {
      await task();
    } finally {
      finishRefresh();
    }
  }, [finishRefresh, mounted, task]);

  return { refreshing, onRefresh, refreshInFlightRef: inFlightRef };
}

export default useSafeRefresh;
