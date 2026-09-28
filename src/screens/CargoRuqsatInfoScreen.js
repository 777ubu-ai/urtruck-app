import React from 'react';
import QueueScreenLazyV2 from './QueueScreenLazyV2';
import { useAuth } from '../utils/AuthContext';

/**
 * Legacy entry-point kept for old deep links/profile shortcuts.
 * There is now one canonical Border/CGR experience; this route renders it
 * instead of the old scoreboard-based info page (which could show stale data).
 */
export default function CargoRuqsatInfoScreen({ navigation, route }) {
  const { session } = useAuth();
  const role = route?.params?.role || session?.user?.role || 'driver';
  const mergedRoute = {
    ...route,
    params: { ...(route?.params || {}), role },
  };
  return <QueueScreenLazyV2 navigation={navigation} route={mergedRoute} />;
}
